from __future__ import annotations

from datetime import date

import pandas as pd
import pytest

from backend.orchestration.power.pjm import hrl_dmd_bids
from backend.orchestration.power.pjm._policies import DataNotYetAvailable


def test_market_day_shape_requires_expected_areas_and_periods():
    target_date = date(2026, 6, 30)

    complete_shape = hrl_dmd_bids._market_day_shape(
        _demand_bid_frame(target_date=target_date, hours=24),
        target_date,
    )
    incomplete_shape = hrl_dmd_bids._market_day_shape(
        _demand_bid_frame(
            target_date=target_date,
            hours=24,
            areas=("PJM_RTO", "MID_ATLANTIC_REGION"),
        ),
        target_date,
    )

    assert complete_shape["is_complete"] is True
    assert complete_shape["row_count"] == 72
    assert complete_shape["area_count"] == 3
    assert complete_shape["period_count"] == 24
    assert incomplete_shape["is_complete"] is False


def test_wait_for_complete_data_raises_for_empty_or_partial_data(monkeypatch):
    target_date = date(2026, 6, 30)

    monkeypatch.setattr(
        hrl_dmd_bids,
        "_fetch_market_day",
        lambda _target_date: _demand_bid_frame(
            target_date=target_date,
            hours=23,
        ),
    )

    with pytest.raises(DataNotYetAvailable):
        hrl_dmd_bids._wait_for_complete_data.__wrapped__(target_date)


def test_wait_for_complete_data_logged_writes_resolved_success(monkeypatch):
    target_date = date(2026, 6, 30)
    expected = _demand_bid_frame(target_date=target_date, hours=24)
    captured: dict[str, object] = {}

    def fake_wait(_target_date):
        return expected

    fake_wait.statistics = {"attempt_number": 3}

    monkeypatch.setattr(hrl_dmd_bids, "_wait_for_complete_data", fake_wait)
    monkeypatch.setattr(
        hrl_dmd_bids,
        "log_api_fetch",
        lambda **kwargs: captured.update(kwargs),
    )

    result = hrl_dmd_bids._wait_for_complete_data_logged(
        target_date=target_date,
        run_id="run-1",
        database="stage_db",
        metadata={"run_mode": "test"},
    )

    assert result is expected
    assert captured["provider"] == "pjm"
    assert captured["pipeline_name"] == "hrl_dmd_bids"
    assert captured["operation_name"] == "hrl_dmd_bids_poll"
    assert captured["status"] == "success"
    assert captured["rows_returned"] == 72
    assert captured["attempt"] == 3
    assert captured["database"] == "stage_db"
    assert captured["metadata"]["run_mode"] == "test"
    assert captured["metadata"]["target_market_date"] == "2026-06-30"
    assert captured["metadata"]["poll_count"] == 3
    assert captured["metadata"]["expected_period_count"] == 24
    assert captured["metadata"]["area_count"] == 3


def test_main_polls_and_upserts_complete_market_day(monkeypatch):
    target_date = date(2026, 6, 30)
    expected = _demand_bid_frame(target_date=target_date, hours=24)
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

    monkeypatch.setattr(hrl_dmd_bids.credentials, "AZURE_POSTGRESQL_DB_NAME", "stage_db")
    monkeypatch.setattr(hrl_dmd_bids, "uuid4", lambda: "run-1")
    monkeypatch.setattr(hrl_dmd_bids, "_wait_for_complete_data_logged", fake_wait)
    monkeypatch.setattr(hrl_dmd_bids, "upsert_feed_frame", fake_upsert)
    monkeypatch.setattr(
        hrl_dmd_bids.script_logging,
        "init_logging",
        lambda **_kwargs: DummyRunLogger(),
    )
    monkeypatch.setattr(hrl_dmd_bids.script_logging, "close_logging", lambda: None)

    result = hrl_dmd_bids.main(
        target_date=target_date,
        run_mode="manual",
        metadata={"source": "test"},
    )

    assert result is expected
    assert captured["wait"]["target_date"] == target_date
    assert captured["wait"]["run_id"] == "run-1"
    assert captured["wait"]["database"] == "stage_db"
    assert captured["wait"]["metadata"] == {"run_mode": "manual", "source": "test"}
    assert captured["upsert_rows"] == 72
    assert captured["upsert_config"] == "hrl_dmd_bids"
    assert captured["upsert_database"] == "stage_db"


def _demand_bid_frame(
    *,
    target_date: date,
    hours: int,
    areas: tuple[str, ...] = (
        "MID_ATLANTIC_REGION",
        "PJM_RTO",
        "WESTERN_REGION",
    ),
) -> pd.DataFrame:
    rows = []
    for hour in range(hours):
        ept = pd.Timestamp(target_date) + pd.Timedelta(hours=hour)
        for area in areas:
            rows.append(
                {
                    "datetime_beginning_ept": ept,
                    "datetime_beginning_utc": ept + pd.Timedelta(hours=4),
                    "hrly_da_demand_bid": 100.0,
                    "area": area,
                }
            )
    return pd.DataFrame(rows)
