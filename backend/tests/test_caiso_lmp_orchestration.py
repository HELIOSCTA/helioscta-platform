from __future__ import annotations

from datetime import date

import pandas as pd

from backend.orchestration.power.caiso import _lmp_readiness
from backend.orchestration.power.caiso import da_lmps, rt_lmps
from backend.scrapes.power.caiso import _lmp


def test_caiso_da_lmp_event_key_and_expected_periods():
    assert (
        da_lmps._data_availability_event_key(date(2026, 7, 16))
        == "caiso_da_lmps:data_ready:2026-07-16:trading_hubs_np15_sp15"
    )
    assert da_lmps._expected_period_count_for_date(date(2026, 7, 16)) == 24
    assert da_lmps._expected_period_count_for_date(date(2026, 3, 8)) == 23
    assert da_lmps._expected_period_count_for_date(date(2026, 11, 1)) == 25


def test_caiso_rt_lmp_expected_periods():
    assert rt_lmps._expected_period_count_for_date(date(2026, 7, 16)) == 288
    assert rt_lmps._expected_period_count_for_date(date(2026, 3, 8)) == 276
    assert rt_lmps._expected_period_count_for_date(date(2026, 11, 1)) == 300


def test_caiso_da_lmps_emits_readiness_for_complete_default_hubs(monkeypatch):
    captured: list[dict[str, object]] = []

    def fake_emit_data_availability_event(**kwargs):
        captured.append(kwargs)
        return {"id": 1, "event_key": kwargs["event_key"], "created": True}

    monkeypatch.setattr(
        _lmp_readiness,
        "emit_data_availability_event",
        fake_emit_data_availability_event,
    )

    events = da_lmps._emit_data_availability_events(
        df=_availability_frame(
            business_date=date(2026, 7, 16),
            periods=24,
            interval_minutes=60,
            nodes=da_lmps.DEFAULT_NODES,
        ),
        run_id="run-1",
        database="stage_db",
    )

    assert events == [
        {
            "id": 1,
            "event_key": (
                "caiso_da_lmps:data_ready:2026-07-16:"
                "trading_hubs_np15_sp15"
            ),
            "created": True,
        }
    ]
    event = captured[0]
    assert event["dataset"] == "caiso_da_lmps"
    assert event["source_system"] == "caiso"
    assert event["availability_type"] == "data_ready"
    assert event["business_date"] == date(2026, 7, 16)
    assert event["scope"] == "trading_hubs_np15_sp15"
    assert event["grain"] == "trading_date_hour_node"
    assert event["source_table"] == "caiso.da_lmps"
    assert event["row_count"] == 48
    assert event["entity_count"] == 2
    assert event["period_count"] == 24
    assert event["completeness_status"] == "complete"
    assert event["run_id"] == "run-1"
    assert event["database"] == "stage_db"
    assert event["payload"]["expected_row_count"] == 48
    assert event["payload"]["expected_nodes"] == sorted(da_lmps.DEFAULT_NODES)


def test_caiso_rt_lmps_skips_readiness_when_a_hub_is_missing(monkeypatch):
    captured: list[dict[str, object]] = []

    monkeypatch.setattr(
        _lmp_readiness,
        "emit_data_availability_event",
        lambda **kwargs: captured.append(kwargs),
    )

    events = rt_lmps._emit_data_availability_events(
        df=_availability_frame(
            business_date=date(2026, 7, 16),
            periods=288,
            interval_minutes=5,
            nodes=("TH_NP15_GEN-APND",),
        ),
        run_id="run-1",
        database="stage_db",
    )

    assert events == []
    assert captured == []


def _availability_frame(
    *,
    business_date: date,
    periods: int,
    interval_minutes: int,
    nodes: tuple[str, ...],
) -> pd.DataFrame:
    start_utc, _end_utc = _lmp.market_day_window_utc(business_date)
    rows = []
    for period in range(periods):
        interval_start = start_utc + pd.Timedelta(minutes=interval_minutes * period)
        for node in nodes:
            rows.append(
                {
                    "operating_date": business_date,
                    "interval_start_time_utc": interval_start,
                    "node_id": node,
                    "locational_marginal_price": 25.0,
                }
            )
    return pd.DataFrame(rows)
