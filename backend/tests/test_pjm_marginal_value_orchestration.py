from __future__ import annotations

from datetime import date, datetime, timezone

import pandas as pd
import pytest

from backend.orchestration.power.pjm import (
    da_marginal_value,
    marginal_value,
    rt_marginal_value,
)
from backend.orchestration.power.pjm._policies import DataNotYetAvailable


def test_da_market_day_shape_accepts_sparse_non_duplicate_constraints():
    target_date = date(2026, 8, 5)

    complete_shape = da_marginal_value._market_day_shape(
        _marginal_frame(
            target_date=target_date,
            interval_indexes=(0, 8, 23),
            interval_minutes=60,
        ),
        target_date,
    )
    empty_shape = da_marginal_value._market_day_shape(pd.DataFrame(), target_date)

    assert complete_shape["is_complete"] is True
    assert complete_shape["row_count"] == 3
    assert complete_shape["period_count"] == 3
    assert complete_shape["constraint_count"] == 3
    assert complete_shape["expected_period_count"] == 24
    assert empty_shape["is_complete"] is False


def test_da_wait_for_available_data_raises_for_empty_data(monkeypatch):
    target_date = date(2026, 8, 5)

    monkeypatch.setattr(
        da_marginal_value,
        "_fetch_market_day",
        lambda _target_date: pd.DataFrame(),
    )

    with pytest.raises(DataNotYetAvailable):
        da_marginal_value._wait_for_available_data.__wrapped__(target_date)


def test_da_wait_for_available_data_logged_writes_resolved_success(monkeypatch):
    target_date = date(2026, 8, 5)
    expected = _marginal_frame(
        target_date=target_date,
        interval_indexes=(0, 8, 23),
        interval_minutes=60,
    )
    captured: dict[str, object] = {}

    def fake_wait(_target_date):
        return expected

    fake_wait.statistics = {"attempt_number": 3}

    monkeypatch.setattr(da_marginal_value, "_wait_for_available_data", fake_wait)
    monkeypatch.setattr(
        da_marginal_value,
        "log_api_fetch",
        lambda **kwargs: captured.update(kwargs),
    )

    result = da_marginal_value._wait_for_available_data_logged(
        target_date=target_date,
        run_id="run-1",
        database="stage_db",
        metadata={"run_mode": "test"},
    )

    assert result is expected
    assert captured["provider"] == "pjm"
    assert captured["pipeline_name"] == "da_marginal_value"
    assert captured["operation_name"] == "da_marginal_value_poll"
    assert captured["status"] == "success"
    assert captured["rows_returned"] == 3
    assert captured["attempt"] == 3
    assert captured["database"] == "stage_db"
    assert captured["metadata"]["run_mode"] == "test"
    assert captured["metadata"]["target_market_date"] == "2026-08-05"
    assert captured["metadata"]["poll_count"] == 3
    assert captured["metadata"]["expected_period_count"] == 24
    assert captured["metadata"]["constraint_count"] == 3


def test_da_emits_readiness_event_for_complete_market_day(monkeypatch):
    target_date = date(2026, 8, 5)
    captured: dict[str, object] = {}

    def fake_emit(**kwargs):
        captured.update(kwargs)
        return {"id": 10, "event_key": kwargs["event_key"], "created": True}

    monkeypatch.setattr(marginal_value, "emit_data_availability_event", fake_emit)

    events = da_marginal_value._emit_data_availability_events(
        df=_marginal_frame(
            target_date=target_date,
            interval_indexes=(0, 8, 23),
            interval_minutes=60,
        ),
        target_date=target_date,
        run_id="run-1",
        database="stage_db",
    )

    assert events == [
        {
            "id": 10,
            "event_key": (
                "pjm_da_marginal_value:data_ready:"
                "2026-08-05:constraint_contingency"
            ),
            "created": True,
        }
    ]
    assert captured["dataset"] == "pjm_da_marginal_value"
    assert captured["source_system"] == "pjm"
    assert captured["availability_type"] == "data_ready"
    assert captured["business_date"] == target_date
    assert captured["scope"] == "constraint_contingency"
    assert captured["grain"] == "date_interval_constraint_contingency"
    assert captured["source_table"] == "pjm.da_marginal_value"
    assert captured["row_count"] == 3
    assert captured["entity_count"] == 3
    assert captured["period_count"] == 3
    assert captured["completeness_status"] == "complete"
    assert captured["run_id"] == "run-1"
    assert captured["database"] == "stage_db"
    assert captured["update_existing"] is True
    assert captured["payload"]["expected_period_count"] == 24


def test_da_main_polls_upserts_and_emits_readiness(monkeypatch):
    target_date = date(2026, 8, 5)
    expected = _marginal_frame(
        target_date=target_date,
        interval_indexes=(0, 8, 23),
        interval_minutes=60,
    )
    captured: dict[str, object] = {}

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
                "id": 10,
                "event_key": (
                    "pjm_da_marginal_value:data_ready:"
                    "2026-08-05:constraint_contingency"
                ),
                "created": True,
            }
        ]

    monkeypatch.setattr(
        da_marginal_value.credentials,
        "AZURE_POSTGRESQL_DB_NAME",
        "stage_db",
    )
    monkeypatch.setattr(da_marginal_value, "uuid4", lambda: "run-1")
    monkeypatch.setattr(da_marginal_value, "_wait_for_available_data_logged", fake_wait)
    monkeypatch.setattr(da_marginal_value, "upsert_feed_frame", fake_upsert)
    monkeypatch.setattr(da_marginal_value, "_emit_data_availability_events", fake_emit)
    monkeypatch.setattr(
        da_marginal_value.script_logging,
        "init_logging",
        lambda **_kwargs: DummyRunLogger(),
    )
    monkeypatch.setattr(da_marginal_value.script_logging, "close_logging", lambda: None)

    result = da_marginal_value.main(
        target_date=target_date,
        run_mode="scheduled",
        metadata={"source": "test"},
    )

    assert result is expected
    assert captured["wait"]["target_date"] == target_date
    assert captured["wait"]["run_id"] == "run-1"
    assert captured["wait"]["database"] == "stage_db"
    assert captured["wait"]["metadata"] == {"run_mode": "scheduled", "source": "test"}
    assert captured["upsert_rows"] == 3
    assert captured["upsert_config"] == "da_marginal_value"
    assert captured["upsert_database"] == "stage_db"
    assert captured["emit"]["target_date"] == target_date


def test_rt_default_target_uses_two_day_eastern_lag(monkeypatch):
    class FakeDateTime(datetime):
        @classmethod
        def now(cls, tz=None):
            value = datetime(2026, 8, 4, 3, 30, tzinfo=timezone.utc)
            return value.astimezone(tz) if tz else value

    monkeypatch.setattr(rt_marginal_value, "datetime", FakeDateTime)

    assert rt_marginal_value._target_market_date() == date(2026, 8, 1)


def test_rt_market_dates_uses_inclusive_lookback():
    assert rt_marginal_value._market_dates(date(2026, 8, 4), 5) == [
        date(2026, 7, 31),
        date(2026, 8, 1),
        date(2026, 8, 2),
        date(2026, 8, 3),
        date(2026, 8, 4),
    ]


def test_rt_wait_for_target_window_requires_target_date(monkeypatch):
    target_date = date(2026, 8, 2)
    older_date = date(2026, 8, 1)

    def fake_fetch(market_date):
        if market_date == older_date:
            return _marginal_frame(
                target_date=older_date,
                interval_indexes=(0, 1),
                interval_minutes=5,
            )
        return pd.DataFrame()

    monkeypatch.setattr(rt_marginal_value, "_fetch_market_day", fake_fetch)

    with pytest.raises(DataNotYetAvailable):
        rt_marginal_value._wait_for_target_window.__wrapped__(
            target_date=target_date,
            lookback_days=2,
        )


def test_rt_wait_for_target_window_logged_writes_resolved_success(monkeypatch):
    target_date = date(2026, 8, 2)
    frames_by_date = {
        date(2026, 8, 1): _marginal_frame(
            target_date=date(2026, 8, 1),
            interval_indexes=(0,),
            interval_minutes=5,
        ),
        target_date: _marginal_frame(
            target_date=target_date,
            interval_indexes=(0, 1),
            interval_minutes=5,
        ),
    }
    captured: dict[str, object] = {}

    def fake_wait(*, target_date, lookback_days):
        assert target_date == date(2026, 8, 2)
        assert lookback_days == 2
        return frames_by_date

    fake_wait.statistics = {"attempt_number": 2}

    monkeypatch.setattr(rt_marginal_value, "_wait_for_target_window", fake_wait)
    monkeypatch.setattr(
        rt_marginal_value,
        "log_api_fetch",
        lambda **kwargs: captured.update(kwargs),
    )

    result = rt_marginal_value._wait_for_target_window_logged(
        target_date=target_date,
        lookback_days=2,
        run_id="run-1",
        database="stage_db",
        metadata={"run_mode": "test"},
    )

    assert result == frames_by_date
    assert captured["provider"] == "pjm"
    assert captured["pipeline_name"] == "rt_marginal_value"
    assert captured["operation_name"] == "rt_marginal_value_poll"
    assert captured["status"] == "success"
    assert captured["rows_returned"] == 3
    assert captured["attempt"] == 2
    assert captured["database"] == "stage_db"
    assert captured["metadata"]["run_mode"] == "test"
    assert captured["metadata"]["target_market_date"] == "2026-08-02"
    assert captured["metadata"]["window_start_market_date"] == "2026-08-01"
    assert captured["metadata"]["window_end_market_date"] == "2026-08-02"
    assert captured["metadata"]["poll_count"] == 2
    assert captured["metadata"]["market_date_shapes"]["2026-08-02"]["row_count"] == 2


def test_rt_main_upserts_combined_window_and_emits_readiness(monkeypatch):
    target_date = date(2026, 8, 2)
    frames_by_date = {
        date(2026, 8, 1): _marginal_frame(
            target_date=date(2026, 8, 1),
            interval_indexes=(0,),
            interval_minutes=5,
        ),
        target_date: _marginal_frame(
            target_date=target_date,
            interval_indexes=(0, 1),
            interval_minutes=5,
        ),
    }
    captured: dict[str, object] = {}

    def fake_wait(**kwargs):
        captured["wait"] = kwargs
        return frames_by_date

    def fake_upsert(df, config, *, database=None):
        captured["upsert_rows"] = len(df)
        captured["upsert_config"] = config.feed_name
        captured["upsert_database"] = database

    def fake_emit(**kwargs):
        captured["emit"] = kwargs
        return [
            {
                "id": 10,
                "event_key": (
                    "pjm_rt_marginal_value:data_ready:"
                    "2026-08-02:constraint_contingency"
                ),
                "created": True,
            }
        ]

    monkeypatch.setattr(
        rt_marginal_value.credentials,
        "AZURE_POSTGRESQL_DB_NAME",
        "stage_db",
    )
    monkeypatch.setattr(rt_marginal_value, "uuid4", lambda: "run-1")
    monkeypatch.setattr(rt_marginal_value, "_wait_for_target_window_logged", fake_wait)
    monkeypatch.setattr(rt_marginal_value, "upsert_feed_frame", fake_upsert)
    monkeypatch.setattr(rt_marginal_value, "_emit_data_availability_events", fake_emit)
    monkeypatch.setattr(
        rt_marginal_value.script_logging,
        "init_logging",
        lambda **_kwargs: DummyRunLogger(),
    )
    monkeypatch.setattr(rt_marginal_value.script_logging, "close_logging", lambda: None)

    result = rt_marginal_value.main(
        target_date=target_date,
        lookback_days=2,
        run_mode="scheduled",
        metadata={"source": "test"},
    )

    assert len(result) == 3
    assert captured["wait"]["target_date"] == target_date
    assert captured["wait"]["lookback_days"] == 2
    assert captured["wait"]["run_id"] == "run-1"
    assert captured["wait"]["database"] == "stage_db"
    assert captured["wait"]["metadata"] == {"run_mode": "scheduled", "source": "test"}
    assert captured["upsert_rows"] == 3
    assert captured["upsert_config"] == "rt_marginal_value"
    assert captured["upsert_database"] == "stage_db"
    assert captured["emit"]["frames_by_date"] == frames_by_date


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


def _marginal_frame(
    *,
    target_date: date,
    interval_indexes: tuple[int, ...],
    interval_minutes: int,
) -> pd.DataFrame:
    rows = []
    for interval_index in interval_indexes:
        ept = pd.Timestamp(target_date) + pd.Timedelta(
            minutes=interval_index * interval_minutes
        )
        rows.append(
            {
                "datetime_beginning_ept": ept,
                "datetime_beginning_utc": ept + pd.Timedelta(hours=4),
                "datetime_ending_ept": ept + pd.Timedelta(minutes=interval_minutes),
                "datetime_ending_utc": (
                    ept
                    + pd.Timedelta(hours=4)
                    + pd.Timedelta(minutes=interval_minutes)
                ),
                "monitored_facility": f"monitored-{interval_index}",
                "contingency_facility": f"contingency-{interval_index}",
                "shadow_price": float(interval_index + 1),
                "limit_control_percentage": 100.0,
                "transmission_constraint_penalty_factor": 1000.0,
            }
        )
    return pd.DataFrame(rows)
