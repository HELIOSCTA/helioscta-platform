from __future__ import annotations

from datetime import date

import pandas as pd

from backend.orchestration.power.isone import hourly_system_demand


def test_isone_hourly_system_demand_expected_period_count_handles_dst_days():
    assert hourly_system_demand._expected_period_count_for_date(date(2026, 6, 12)) == 24
    assert hourly_system_demand._expected_period_count_for_date(date(2026, 3, 8)) == 23
    assert hourly_system_demand._expected_period_count_for_date(date(2026, 11, 1)) == 25


def test_isone_hourly_system_demand_event_key():
    assert (
        hourly_system_demand._data_availability_event_key(date(2026, 6, 12))
        == "isone_hourly_system_demand:data_ready:2026-06-12:system"
    )


def test_isone_hourly_system_demand_emits_readiness_event_for_complete_rows(
    monkeypatch,
):
    captured: list[dict[str, object]] = []

    def fake_emit_data_availability_event(**kwargs):
        captured.append(kwargs)
        return {"id": 1, "event_key": kwargs["event_key"], "created": True}

    monkeypatch.setattr(
        hourly_system_demand,
        "emit_data_availability_event",
        fake_emit_data_availability_event,
    )

    events = hourly_system_demand._emit_data_availability_events(
        df=_availability_frame(hours=24),
        run_id="run-1",
        database="stage_db",
    )

    assert events == [
        {
            "id": 1,
            "event_key": "isone_hourly_system_demand:data_ready:2026-06-12:system",
            "created": True,
        }
    ]
    event = captured[0]
    assert event["dataset"] == "isone_hourly_system_demand"
    assert event["source_system"] == "isone"
    assert event["availability_type"] == "data_ready"
    assert event["business_date"] == date(2026, 6, 12)
    assert event["scope"] == "system"
    assert event["grain"] == "date_hour"
    assert event["source_table"] == "isone.hourly_system_demand"
    assert event["row_count"] == 24
    assert event["entity_count"] == 1
    assert event["period_count"] == 24
    assert event["completeness_status"] == "complete"
    assert event["run_id"] == "run-1"
    assert event["database"] == "stage_db"
    assert event["payload"]["expected_period_count"] == 24


def test_isone_hourly_system_demand_skips_readiness_event_for_incomplete_rows(
    monkeypatch,
):
    captured: list[dict[str, object]] = []

    monkeypatch.setattr(
        hourly_system_demand,
        "emit_data_availability_event",
        lambda **kwargs: captured.append(kwargs),
    )

    events = hourly_system_demand._emit_data_availability_events(
        df=_availability_frame(hours=23),
        run_id="run-1",
        database="stage_db",
    )

    assert events == []
    assert captured == []


def _availability_frame(hours: int) -> pd.DataFrame:
    rows = []
    for hour in range(1, hours + 1):
        rows.append(
            {
                "date": pd.Timestamp("2026-06-12").date(),
                "hour_ending": hour,
                "total_load": 16000.0 + hour,
            }
        )
    return pd.DataFrame(rows)
