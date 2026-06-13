from __future__ import annotations

from datetime import date

import pandas as pd

from backend.orchestration.power.ercot import settlement_point_prices


def test_ercot_rt_spp_expected_period_count_handles_normal_and_dst_days():
    assert settlement_point_prices._expected_period_count_for_date(date(2026, 6, 13)) == 96
    assert settlement_point_prices._expected_period_count_for_date(date(2026, 3, 8)) == 92
    assert settlement_point_prices._expected_period_count_for_date(date(2026, 11, 1)) == 100


def test_ercot_rt_spp_event_key():
    assert (
        settlement_point_prices._data_availability_event_key(date(2026, 6, 13))
        == "ercot_settlement_point_prices:data_ready:2026-06-13:hub"
    )


def test_ercot_rt_spp_emits_readiness_event_for_complete_hub_rows(monkeypatch):
    captured: list[dict[str, object]] = []

    def fake_emit_data_availability_event(**kwargs):
        captured.append(kwargs)
        return {"id": 1, "event_key": kwargs["event_key"], "created": True}

    monkeypatch.setattr(
        settlement_point_prices,
        "emit_data_availability_event",
        fake_emit_data_availability_event,
    )

    events = settlement_point_prices._emit_data_availability_events(
        df=_rt_spp_availability_frame(hours=24, intervals=4),
        run_id="run-1",
        database="stage_db",
    )

    assert events == [
        {
            "id": 1,
            "event_key": "ercot_settlement_point_prices:data_ready:2026-06-13:hub",
            "created": True,
        }
    ]
    event = captured[0]
    assert event["dataset"] == "ercot_settlement_point_prices"
    assert event["source_system"] == "ercot"
    assert event["availability_type"] == "data_ready"
    assert event["business_date"] == date(2026, 6, 13)
    assert event["scope"] == "hub"
    assert event["grain"] == "date_15min_settlementpoint"
    assert event["source_table"] == "ercot.settlement_point_prices"
    assert event["row_count"] == 384
    assert event["entity_count"] == 4
    assert event["period_count"] == 96
    assert event["completeness_status"] == "complete"
    assert event["run_id"] == "run-1"
    assert event["database"] == "stage_db"
    assert event["payload"]["expected_period_count"] == 96
    assert event["payload"]["expected_entity_count"] == 4
    assert event["payload"]["expected_row_count"] == 384


def test_ercot_rt_spp_skips_readiness_event_for_incomplete_rows(monkeypatch):
    captured: list[dict[str, object]] = []

    monkeypatch.setattr(
        settlement_point_prices,
        "emit_data_availability_event",
        lambda **kwargs: captured.append(kwargs),
    )

    events = settlement_point_prices._emit_data_availability_events(
        df=_rt_spp_availability_frame(hours=23, intervals=4),
        run_id="run-1",
        database="stage_db",
    )

    assert events == []
    assert captured == []


def _rt_spp_availability_frame(hours: int, intervals: int) -> pd.DataFrame:
    settlement_points = (
        "HB_NORTH",
        "HB_SOUTH",
        "HB_WEST",
        "HB_HOUSTON",
    )
    rows = []
    for hour in range(1, hours + 1):
        for interval in range(1, intervals + 1):
            for settlement_point in settlement_points:
                rows.append(
                    {
                        "deliverydate": pd.Timestamp("2026-06-13").date(),
                        "deliveryhour": hour,
                        "deliveryinterval": interval,
                        "settlementpoint": settlement_point,
                        "settlementpointprice": 25.0,
                    }
                )
    return pd.DataFrame(rows)
