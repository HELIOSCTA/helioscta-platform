from __future__ import annotations

import json
from datetime import date

import pandas as pd

from backend.scrapes.power.pjm import da_hrl_lmps as scrape_da_hrl_lmps
from backend.orchestration.power.pjm import da_hrl_lmps as orchestrated_da_hrl_lmps
from backend.utils import db, script_logging
from backend.utils import data_availability
from backend.utils.ops_logging import redact_secrets


def test_build_request_keeps_pjm_key_out_of_url(monkeypatch):
    monkeypatch.setattr(orchestrated_da_hrl_lmps.credentials, "PJM_API_KEY", "secret-key")

    url, params = orchestrated_da_hrl_lmps._build_request(
        start_date="2026-06-10 00:00",
        end_date="2026-06-10 23:00",
    )

    assert url == "https://api.pjm.com/api/v1/da_hrl_lmps"
    assert "secret-key" not in url
    assert params["subscription-key"] == "secret-key"


def test_da_lmp_polling_policy_uses_minute_interval_and_five_hour_ceiling():
    assert orchestrated_da_hrl_lmps.POLL_CEILING_SECONDS == 5 * 60 * 60
    assert orchestrated_da_hrl_lmps.POLL_WAIT_SECONDS == 60


def test_wait_for_data_http_error_does_not_expose_request_url(monkeypatch):
    class FakeResponse:
        content = b""
        status_code = 401
        reason = "Unauthorized"

        def raise_for_status(self):
            raise orchestrated_da_hrl_lmps.requests.HTTPError(
                "401 Client Error for url: "
                "https://api.pjm.com/api/v1/da_hrl_lmps?subscription-key=secret-key"
            )

    monkeypatch.setattr(
        orchestrated_da_hrl_lmps.requests,
        "get",
        lambda *_args, **_kwargs: FakeResponse(),
    )

    try:
        orchestrated_da_hrl_lmps._wait_for_data(
            url="https://api.pjm.com/api/v1/da_hrl_lmps",
            params={"subscription-key": "secret-key"},
        )
    except RuntimeError as exc:
        message = str(exc)
    else:
        raise AssertionError("Expected sanitized HTTP failure")

    assert "secret-key" not in message
    assert "subscription-key" not in message
    assert message == "PJM DA HRL LMPs API returned HTTP 401: Unauthorized"


def test_redact_secrets_scrubs_query_values():
    message = (
        "403 Client Error for url: "
        "https://api.pjm.com/api/v1/feed?subscription-key=abc123&token=xyz"
    )

    redacted = redact_secrets(message)

    assert "abc123" not in redacted
    assert "xyz" not in redacted
    assert "subscription-key=***" in redacted
    assert "token=***" in redacted


def test_log_dir_can_be_overridden(monkeypatch, tmp_path):
    monkeypatch.setenv("HELIOS_LOG_DIR", str(tmp_path))

    assert script_logging.get_log_dir("logs") == tmp_path


def test_scrape_main_defaults_database_and_generates_run_id(monkeypatch):
    monkeypatch.setattr(scrape_da_hrl_lmps.credentials, "AZURE_POSTGRESQL_DB_NAME", "stage_db")
    monkeypatch.setattr(scrape_da_hrl_lmps, "uuid4", lambda: "run-1")

    captured: dict[str, str | None] = {}

    class DummyRunLogger:
        log_file_path = None

        def header(self, _msg: str) -> None:
            pass

        def info(self, _msg: str) -> None:
            pass

        def section(self, _msg: str) -> None:
            pass

        def success(self, _msg: str) -> None:
            pass

        def exception(self, _msg: str) -> None:
            pass

    def fake_pull(
        *,
        database: str | None,
        run_id: str | None,
        **_kwargs,
    ) -> pd.DataFrame:
        captured["pull_database"] = database
        captured["pull_run_id"] = run_id
        return pd.DataFrame()

    monkeypatch.setattr(scrape_da_hrl_lmps.script_logging, "init_logging", lambda **_kwargs: DummyRunLogger())
    monkeypatch.setattr(scrape_da_hrl_lmps.script_logging, "close_logging", lambda: None)
    monkeypatch.setattr(scrape_da_hrl_lmps, "_pull", fake_pull)

    scrape_da_hrl_lmps.main(
        start_date=pd.Timestamp("2026-06-10"),
        end_date=pd.Timestamp("2026-06-10"),
    )

    assert captured["pull_database"] == "stage_db"
    assert captured["pull_run_id"] == "run-1"


def test_upsert_dataframe_uses_temp_staging_not_target_ddl(monkeypatch):
    executed: list[object] = []
    copied: list[str] = []
    copied_payloads: list[str] = []

    class FakeCursor:
        def execute(self, query, params=None):
            executed.append(query)

        def fetchall(self):
            return [
                ("id",),
                ("value",),
                ("created_at",),
                ("updated_at",),
            ]

        def copy_expert(self, query, buffer):
            copied.append(query)
            copied_payloads.append(buffer.getvalue())

        def close(self):
            pass

    class FakeConnection:
        def __init__(self):
            self.cursor_instance = FakeCursor()

        def cursor(self):
            return self.cursor_instance

        def commit(self):
            pass

        def rollback(self):
            pass

        def close(self):
            pass

    class FakeCopySql:
        def as_string(self, _connection):
            return "COPY temp"

    monkeypatch.setattr(db, "connect", lambda database=None: FakeConnection())
    monkeypatch.setattr(db, "_assert_target_table_sql", lambda **_kwargs: "ASSERT TARGET")
    monkeypatch.setattr(db, "_create_temp_table_sql", lambda **_kwargs: "CREATE TEMP TABLE temp")
    monkeypatch.setattr(db, "_copy_sql", lambda _table_name: FakeCopySql())
    monkeypatch.setattr(db, "_upsert_sql", lambda **_kwargs: "UPSERT")

    db.upsert_dataframe(
        schema="test_schema",
        table_name="test_table",
        df=pd.DataFrame([{"id": 1, "value": "x"}]),
        columns=["id", "value"],
        primary_key=["id"],
        data_types=["INTEGER", "VARCHAR"],
    )

    executed_text = "\n".join(str(query) for query in executed)
    assert "CREATE TABLE IF NOT EXISTS" not in executed_text
    assert "CREATE TEMP TABLE temp" in executed_text
    assert copied
    assert copied_payloads[0].startswith("1,x,")


def test_upsert_dataframe_serializes_numeric_nulls_for_copy(monkeypatch):
    copied_payloads: list[str] = []

    class FakeCursor:
        def execute(self, _query, _params=None):
            pass

        def fetchall(self):
            return [
                ("id",),
                ("value",),
                ("created_at",),
                ("updated_at",),
            ]

        def copy_expert(self, _query, buffer):
            copied_payloads.append(buffer.getvalue())

        def close(self):
            pass

    class FakeConnection:
        def cursor(self):
            return FakeCursor()

        def commit(self):
            pass

        def rollback(self):
            pass

        def close(self):
            pass

    class FakeCopySql:
        def as_string(self, _connection):
            return "COPY temp"

    monkeypatch.setattr(db, "connect", lambda database=None: FakeConnection())
    monkeypatch.setattr(db, "_assert_target_table_sql", lambda **_kwargs: "ASSERT TARGET")
    monkeypatch.setattr(db, "_create_temp_table_sql", lambda **_kwargs: "CREATE TEMP TABLE temp")
    monkeypatch.setattr(db, "_copy_sql", lambda _table_name: FakeCopySql())
    monkeypatch.setattr(db, "_upsert_sql", lambda **_kwargs: "UPSERT")

    db.upsert_dataframe(
        schema="test_schema",
        table_name="test_table",
        df=pd.DataFrame([{"id": 1, "value": pd.NA}]),
        columns=["id", "value"],
        primary_key=["id"],
        data_types=["INTEGER", "DOUBLE PRECISION"],
    )

    assert copied_payloads
    assert copied_payloads[0].startswith("1,,")


def test_emit_data_availability_event_is_idempotent(monkeypatch):
    captured: dict[str, object] = {}

    def fake_execute_sql(query, params=None, database=None, fetch=False):
        captured["query"] = query
        captured["params"] = params
        captured["database"] = database
        captured["fetch"] = fetch
        return [{"id": 10, "event_key": params[0], "created": True}]

    monkeypatch.setattr(data_availability.db, "execute_sql", fake_execute_sql)

    result = data_availability.emit_data_availability_event(
        event_key="pjm_da_hrl_lmps:data_ready:2026-06-13:hub",
        dataset="pjm_da_hrl_lmps",
        source_system="pjm",
        availability_type="data_ready",
        business_date=date(2026, 6, 13),
        source_table="pjm.da_hrl_lmps",
        row_count=48,
        entity_count=2,
        period_count=24,
        completeness_status="complete",
        run_id="run-1",
        payload={"expected_period_count": 24},
        database="stage_db",
    )

    assert result == {
        "id": 10,
        "event_key": "pjm_da_hrl_lmps:data_ready:2026-06-13:hub",
        "created": True,
    }
    assert "ops.data_availability_events" in captured["query"]
    assert "ON CONFLICT (event_key) DO NOTHING" in captured["query"]
    assert captured["database"] == "stage_db"
    assert captured["fetch"] is True
    params = captured["params"]
    assert params[0] == "pjm_da_hrl_lmps:data_ready:2026-06-13:hub"
    assert json.loads(params[-2]) == {"expected_period_count": 24}
    assert params[-1] == "pjm_da_hrl_lmps:data_ready:2026-06-13:hub"


def test_orchestrated_da_emits_readiness_event_for_complete_current_rows(monkeypatch):
    captured: list[dict[str, object]] = []

    def fake_emit_data_availability_event(**kwargs):
        captured.append(kwargs)
        return {"id": 1, "event_key": kwargs["event_key"], "created": True}

    monkeypatch.setattr(
        orchestrated_da_hrl_lmps,
        "emit_data_availability_event",
        fake_emit_data_availability_event,
    )

    events = orchestrated_da_hrl_lmps._emit_data_availability_events(
        df=_da_availability_frame(hours=24),
        run_id="run-1",
        database="stage_db",
    )

    assert events == [
        {
            "id": 1,
            "event_key": "pjm_da_hrl_lmps:data_ready:2026-06-13:hub",
            "created": True,
        }
    ]
    assert len(captured) == 1
    event = captured[0]
    assert event["event_key"] == "pjm_da_hrl_lmps:data_ready:2026-06-13:hub"
    assert event["dataset"] == "pjm_da_hrl_lmps"
    assert event["source_system"] == "pjm"
    assert event["availability_type"] == "data_ready"
    assert event["business_date"] == date(2026, 6, 13)
    assert event["scope"] == "hub"
    assert event["grain"] == "date_hour_hub"
    assert event["source_table"] == "pjm.da_hrl_lmps"
    assert event["row_count"] == 48
    assert event["entity_count"] == 2
    assert event["period_count"] == 24
    assert event["completeness_status"] == "complete"
    assert event["run_id"] == "run-1"
    assert event["database"] == "stage_db"
    assert event["payload"]["expected_period_count"] == 24
    assert event["payload"]["expected_row_count"] == 48


def test_orchestrated_da_skips_readiness_event_for_incomplete_current_rows(monkeypatch):
    captured: list[dict[str, object]] = []

    monkeypatch.setattr(
        orchestrated_da_hrl_lmps,
        "emit_data_availability_event",
        lambda **kwargs: captured.append(kwargs),
    )

    events = orchestrated_da_hrl_lmps._emit_data_availability_events(
        df=_da_availability_frame(hours=23),
        run_id="run-1",
        database="stage_db",
    )

    assert events == []
    assert captured == []


def test_orchestrated_da_slack_notifications_are_idempotent_and_sent(monkeypatch):
    calls: list[dict[str, object]] = []

    class DummyRunLogger:
        def info(self, _msg: str) -> None:
            pass

        def exception(self, _msg: str) -> None:
            pass

    monkeypatch.setattr(
        orchestrated_da_hrl_lmps.slack_notifications,
        "build_pjm_da_hrl_lmp_release_slack",
        lambda **kwargs: {
            "notification_key": f"{kwargs['event']['event_key']}:slack:release",
            "channel_id": "CPOWER",
            "channel_name": "#helios-alerts-power",
            "message_text": "message",
            "dataset": "pjm_da_hrl_lmps",
            "source_event_key": kwargs["event"]["event_key"],
            "source_event_id": kwargs["event"]["id"],
            "payload": {},
        },
    )

    def fake_enqueue(**kwargs):
        calls.append(kwargs)
        return {"created": True}

    monkeypatch.setattr(
        orchestrated_da_hrl_lmps.slack_notifications,
        "enqueue_slack_notification",
        fake_enqueue,
    )
    monkeypatch.setattr(
        orchestrated_da_hrl_lmps.slack_notifications,
        "notifications_enabled",
        lambda: True,
    )
    monkeypatch.setattr(
        orchestrated_da_hrl_lmps.slack_notifications,
        "send_due_slack_notifications",
        lambda **kwargs: [{"status": "sent", **kwargs}],
    )

    queued = orchestrated_da_hrl_lmps._notify_da_slack_release_events(
        events=[
            {
                "id": 1,
                "event_key": "pjm_da_hrl_lmps:data_ready:2026-07-02:hub",
            }
        ],
        run_mode="scheduled",
        database="stage_db",
        run_logger=DummyRunLogger(),
    )

    assert queued == 1
    assert calls[0]["notification_key"] == (
        "pjm_da_hrl_lmps:data_ready:2026-07-02:hub:slack:release"
    )
    assert calls[0]["channel_id"] == "CPOWER"
    assert calls[0]["database"] == "stage_db"


def _da_availability_frame(hours: int) -> pd.DataFrame:
    rows = []
    for hour in range(hours):
        for pnode_id, pnode_name in [(1, "WESTERN HUB"), (2, "EASTERN HUB")]:
            ept = pd.Timestamp("2026-06-13") + pd.Timedelta(hours=hour)
            rows.append(
                {
                    "datetime_beginning_utc": ept + pd.Timedelta(hours=4),
                    "datetime_beginning_ept": ept,
                    "pnode_id": pnode_id,
                    "pnode_name": pnode_name,
                    "row_is_current": True,
                    "version_nbr": 1,
                }
            )
    return pd.DataFrame(rows)
