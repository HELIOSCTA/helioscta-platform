from __future__ import annotations

import pandas as pd

from backend.scrapes.power.pjm import da_hrl_lmps as scrape_da_hrl_lmps
from backend.orchestration.power.pjm import da_hrl_lmps as orchestrated_da_hrl_lmps
from backend.utils import db, script_logging
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

        def copy_expert(self, query, _buffer):
            copied.append(query)

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
