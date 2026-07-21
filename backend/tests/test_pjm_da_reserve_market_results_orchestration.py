from __future__ import annotations

from datetime import date, datetime, timezone

import pandas as pd
import pytest

from backend.orchestration.power.pjm import da_reserve_market_results
from backend.orchestration.power.pjm._policies import DataNotYetAvailable


def test_default_target_market_date_uses_current_eastern_date(monkeypatch):
    class FakeDateTime(datetime):
        @classmethod
        def now(cls, tz=None):
            value = datetime(2026, 7, 2, 1, 30, tzinfo=timezone.utc)
            return value.astimezone(tz) if tz else value

    monkeypatch.setattr(da_reserve_market_results, "datetime", FakeDateTime)

    assert da_reserve_market_results._target_market_date() == date(2026, 7, 1)


def test_market_day_shape_requires_full_locale_service_hours():
    target_date = date(2026, 7, 2)

    complete_shape = da_reserve_market_results._market_day_shape(
        _reserve_market_frame(target_date=target_date, hours=24),
        target_date,
    )
    incomplete_shape = da_reserve_market_results._market_day_shape(
        _reserve_market_frame(
            target_date=target_date,
            hours=24,
            pairs=(("PJM RTO Reserve Zone", "Thirty Minutes Reserve"),),
        ),
        target_date,
    )

    assert complete_shape["is_complete"] is True
    assert complete_shape["row_count"] == 120
    assert complete_shape["locale_count"] == 2
    assert complete_shape["service_count"] == 3
    assert complete_shape["locale_service_count"] == 5
    assert complete_shape["period_count"] == 24
    assert complete_shape["min_periods_per_locale_service"] == 24
    assert incomplete_shape["is_complete"] is False


def test_wait_for_complete_data_raises_for_partial_data(monkeypatch):
    target_date = date(2026, 7, 2)

    monkeypatch.setattr(
        da_reserve_market_results,
        "_fetch_market_day",
        lambda _target_date: _reserve_market_frame(
            target_date=target_date,
            hours=23,
        ),
    )

    with pytest.raises(DataNotYetAvailable):
        da_reserve_market_results._wait_for_complete_data.__wrapped__(target_date)


def test_wait_for_complete_data_logged_writes_resolved_success(monkeypatch):
    target_date = date(2026, 7, 2)
    expected = _reserve_market_frame(target_date=target_date, hours=24)
    captured: dict[str, object] = {}

    def fake_wait(_target_date):
        return expected

    fake_wait.statistics = {"attempt_number": 4}

    monkeypatch.setattr(da_reserve_market_results, "_wait_for_complete_data", fake_wait)
    monkeypatch.setattr(
        da_reserve_market_results,
        "log_api_fetch",
        lambda **kwargs: captured.update(kwargs),
    )

    result = da_reserve_market_results._wait_for_complete_data_logged(
        target_date=target_date,
        run_id="run-1",
        database="stage_db",
        metadata={"run_mode": "test"},
    )

    assert result is expected
    assert captured["provider"] == "pjm"
    assert captured["pipeline_name"] == "da_reserve_market_results"
    assert captured["operation_name"] == "da_reserve_market_results_poll"
    assert captured["status"] == "success"
    assert captured["rows_returned"] == 120
    assert captured["attempt"] == 4
    assert captured["database"] == "stage_db"
    assert captured["metadata"]["run_mode"] == "test"
    assert captured["metadata"]["target_market_date"] == "2026-07-02"
    assert captured["metadata"]["poll_count"] == 4
    assert captured["metadata"]["expected_period_count"] == 24
    assert captured["metadata"]["locale_service_count"] == 5


def test_emits_readiness_event_for_complete_market_day(monkeypatch):
    target_date = date(2026, 7, 2)
    captured: dict[str, object] = {}

    def fake_emit(**kwargs):
        captured.update(kwargs)
        return {"id": 10, "event_key": kwargs["event_key"], "created": True}

    monkeypatch.setattr(
        da_reserve_market_results,
        "emit_data_availability_event",
        fake_emit,
    )

    events = da_reserve_market_results._emit_data_availability_events(
        df=_reserve_market_frame(target_date=target_date, hours=24),
        target_date=target_date,
        run_id="run-1",
        database="stage_db",
    )

    assert events == [
        {
            "id": 10,
            "event_key": (
                "pjm_da_reserve_market_results:data_ready:"
                "2026-07-02:locale_service"
            ),
            "created": True,
        }
    ]
    assert captured["dataset"] == "pjm_da_reserve_market_results"
    assert captured["source_system"] == "pjm"
    assert captured["availability_type"] == "data_ready"
    assert captured["business_date"] == target_date
    assert captured["scope"] == "locale_service"
    assert captured["grain"] == "date_hour_locale_service"
    assert captured["source_table"] == "pjm.da_reserve_market_results"
    assert captured["row_count"] == 120
    assert captured["entity_count"] == 5
    assert captured["period_count"] == 24
    assert captured["completeness_status"] == "complete"
    assert captured["run_id"] == "run-1"
    assert captured["database"] == "stage_db"


def test_main_polls_upserts_and_emits_readiness(monkeypatch):
    target_date = date(2026, 7, 2)
    expected = _reserve_market_frame(target_date=target_date, hours=24)
    captured: dict[str, object] = {}

    class DummyRunLogger:
        def header(self, _message):
            pass

        def info(self, _message):
            pass

        def section(self, _message):
            pass

        def success(self, _message):
            pass

        def exception(self, _message):
            pass

    def fake_wait(**kwargs):
        captured["wait"] = kwargs
        return expected

    def fake_upsert(df, config, *, database=None):
        captured["upsert_rows"] = len(df)
        captured["upsert_config"] = config.feed_name
        captured["upsert_database"] = database

    def fake_emit(**kwargs):
        captured["emit"] = kwargs
        return [
            {
                "id": 1,
                "event_key": (
                    "pjm_da_reserve_market_results:data_ready:"
                    "2026-07-02:locale_service"
                ),
                "created": True,
            }
        ]

    monkeypatch.setattr(
        da_reserve_market_results.credentials,
        "AZURE_POSTGRESQL_DB_NAME",
        "stage_db",
    )
    monkeypatch.setattr(da_reserve_market_results, "uuid4", lambda: "run-1")
    monkeypatch.setattr(
        da_reserve_market_results,
        "_wait_for_complete_data_logged",
        fake_wait,
    )
    monkeypatch.setattr(da_reserve_market_results, "upsert_feed_frame", fake_upsert)
    monkeypatch.setattr(
        da_reserve_market_results,
        "_emit_data_availability_events",
        fake_emit,
    )
    monkeypatch.setattr(
        da_reserve_market_results.script_logging,
        "init_logging",
        lambda **_kwargs: DummyRunLogger(),
    )
    monkeypatch.setattr(
        da_reserve_market_results.script_logging,
        "close_logging",
        lambda: None,
    )

    result = da_reserve_market_results.main(
        target_date=target_date,
        run_mode="scheduled",
        metadata={"source": "test"},
    )

    assert result is expected
    assert captured["wait"]["target_date"] == target_date
    assert captured["wait"]["run_id"] == "run-1"
    assert captured["wait"]["database"] == "stage_db"
    assert captured["wait"]["metadata"] == {"run_mode": "scheduled", "source": "test"}
    assert captured["upsert_rows"] == 120
    assert captured["upsert_config"] == "da_reserve_market_results"
    assert captured["upsert_database"] == "stage_db"
    assert captured["emit"]["target_date"] == target_date


def _reserve_market_frame(
    *,
    target_date: date,
    hours: int,
    pairs: tuple[tuple[str, str], ...] = (
        ("PJM RTO Reserve Zone", "Primary Reserve"),
        ("PJM RTO Reserve Zone", "Synchronized Reserve"),
        ("PJM RTO Reserve Zone", "Thirty Minutes Reserve"),
        ("MAD Reserve Zone", "Primary Reserve"),
        ("MAD Reserve Zone", "Synchronized Reserve"),
    ),
) -> pd.DataFrame:
    rows = []
    for hour in range(hours):
        ept = pd.Timestamp(target_date) + pd.Timedelta(hours=hour)
        for locale, service in pairs:
            rows.append(
                {
                    "datetime_beginning_ept": ept,
                    "datetime_beginning_utc": ept + pd.Timedelta(hours=4),
                    "locale": locale,
                    "service": service,
                    "mcp": 1.25,
                    "mcp_capped": 1.25,
                    "as_mw": 100.0,
                    "as_req_mw": 90.0,
                    "total_mw": 100.0,
                }
            )
    return pd.DataFrame(rows)
