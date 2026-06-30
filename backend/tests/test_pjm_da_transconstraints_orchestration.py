from __future__ import annotations

from datetime import date

import pandas as pd
import pytest

from backend.orchestration.power.pjm import da_transconstraints
from backend.orchestration.power.pjm._policies import DataNotYetAvailable


def test_market_day_shape_accepts_sparse_non_duplicate_constraints():
    target_date = date(2026, 6, 30)

    complete_shape = da_transconstraints._market_day_shape(
        _constraints_frame(target_date=target_date, hours=(0, 8, 17)),
        target_date,
    )
    empty_shape = da_transconstraints._market_day_shape(pd.DataFrame(), target_date)

    assert complete_shape["is_complete"] is True
    assert complete_shape["row_count"] == 3
    assert complete_shape["period_count"] == 3
    assert complete_shape["constraint_count"] == 3
    assert complete_shape["expected_period_count"] == 24
    assert empty_shape["is_complete"] is False


def test_wait_for_available_data_raises_for_empty_data(monkeypatch):
    target_date = date(2026, 6, 30)

    monkeypatch.setattr(
        da_transconstraints,
        "_fetch_market_day",
        lambda _target_date: pd.DataFrame(),
    )

    with pytest.raises(DataNotYetAvailable):
        da_transconstraints._wait_for_available_data.__wrapped__(target_date)


def test_wait_for_available_data_logged_writes_resolved_success(monkeypatch):
    target_date = date(2026, 6, 30)
    expected = _constraints_frame(target_date=target_date, hours=(0, 8, 17))
    captured: dict[str, object] = {}

    def fake_wait(_target_date):
        return expected

    fake_wait.statistics = {"attempt_number": 3}

    monkeypatch.setattr(da_transconstraints, "_wait_for_available_data", fake_wait)
    monkeypatch.setattr(
        da_transconstraints,
        "log_api_fetch",
        lambda **kwargs: captured.update(kwargs),
    )

    result = da_transconstraints._wait_for_available_data_logged(
        target_date=target_date,
        run_id="run-1",
        database="stage_db",
        metadata={"run_mode": "test"},
    )

    assert result is expected
    assert captured["provider"] == "pjm"
    assert captured["pipeline_name"] == "da_transconstraints"
    assert captured["operation_name"] == "da_transconstraints_poll"
    assert captured["status"] == "success"
    assert captured["rows_returned"] == 3
    assert captured["attempt"] == 3
    assert captured["database"] == "stage_db"
    assert captured["metadata"]["run_mode"] == "test"
    assert captured["metadata"]["target_market_date"] == "2026-06-30"
    assert captured["metadata"]["poll_count"] == 3
    assert captured["metadata"]["expected_period_count"] == 24
    assert captured["metadata"]["constraint_count"] == 3


def test_main_polls_and_upserts_available_market_day(monkeypatch):
    target_date = date(2026, 6, 30)
    expected = _constraints_frame(target_date=target_date, hours=(0, 8, 17))
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

    monkeypatch.setattr(
        da_transconstraints.credentials,
        "AZURE_POSTGRESQL_DB_NAME",
        "stage_db",
    )
    monkeypatch.setattr(da_transconstraints, "uuid4", lambda: "run-1")
    monkeypatch.setattr(da_transconstraints, "_wait_for_available_data_logged", fake_wait)
    monkeypatch.setattr(da_transconstraints, "upsert_feed_frame", fake_upsert)
    monkeypatch.setattr(
        da_transconstraints.script_logging,
        "init_logging",
        lambda **_kwargs: DummyRunLogger(),
    )
    monkeypatch.setattr(da_transconstraints.script_logging, "close_logging", lambda: None)

    result = da_transconstraints.main(
        target_date=target_date,
        run_mode="manual",
        metadata={"source": "test"},
    )

    assert result is expected
    assert captured["wait"]["target_date"] == target_date
    assert captured["wait"]["run_id"] == "run-1"
    assert captured["wait"]["database"] == "stage_db"
    assert captured["wait"]["metadata"] == {"run_mode": "manual", "source": "test"}
    assert captured["upsert_rows"] == 3
    assert captured["upsert_config"] == "da_transconstraints"
    assert captured["upsert_database"] == "stage_db"


def _constraints_frame(*, target_date: date, hours: tuple[int, ...]) -> pd.DataFrame:
    rows = []
    for hour in hours:
        ept = pd.Timestamp(target_date) + pd.Timedelta(hours=hour)
        rows.append(
            {
                "datetime_beginning_ept": ept,
                "datetime_beginning_utc": ept + pd.Timedelta(hours=4),
                "datetime_ending_ept": ept + pd.Timedelta(hours=1),
                "datetime_ending_utc": ept + pd.Timedelta(hours=5),
                "day_ahead_congestion_event": f"event-{hour}",
                "monitored_facility": f"monitored-{hour}",
                "contingency_facility": f"contingency-{hour}",
                "duration": 1.0,
            }
        )
    return pd.DataFrame(rows)
