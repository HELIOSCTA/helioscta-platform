from __future__ import annotations

from datetime import date

import pandas as pd

from backend.orchestration.power.isone import rt_hrl_scheduled_interchange


def test_isone_rt_hrl_scheduled_interchange_expected_period_count_dst_days():
    assert (
        rt_hrl_scheduled_interchange._expected_period_count_for_date(
            date(2026, 6, 12)
        )
        == 24
    )
    assert (
        rt_hrl_scheduled_interchange._expected_period_count_for_date(
            date(2026, 3, 8)
        )
        == 23
    )
    assert (
        rt_hrl_scheduled_interchange._expected_period_count_for_date(
            date(2026, 11, 1)
        )
        == 25
    )


def test_isone_rt_hrl_scheduled_interchange_event_key():
    assert (
        rt_hrl_scheduled_interchange._data_availability_event_key(
            date(2026, 6, 12)
        )
        == "isone_rt_hrl_scheduled_interchange:data_ready:2026-06-12:all_interfaces"
    )


def test_isone_rt_hrl_scheduled_interchange_emits_complete_readiness(monkeypatch):
    captured: list[dict[str, object]] = []

    def fake_emit_data_availability_event(**kwargs):
        captured.append(kwargs)
        return {"id": 1, "event_key": kwargs["event_key"], "created": True}

    monkeypatch.setattr(
        rt_hrl_scheduled_interchange,
        "emit_data_availability_event",
        fake_emit_data_availability_event,
    )

    events = rt_hrl_scheduled_interchange._emit_data_availability_events(
        df=_availability_frame(hours=24, interfaces=("A", "B")),
        run_id="run-1",
        database="stage_db",
    )

    assert events == [
        {
            "id": 1,
            "event_key": (
                "isone_rt_hrl_scheduled_interchange:data_ready:"
                "2026-06-12:all_interfaces"
            ),
            "created": True,
        }
    ]
    event = captured[0]
    assert event["dataset"] == "isone_rt_hrl_scheduled_interchange"
    assert event["source_table"] == "isone.rt_hrl_scheduled_interchange"
    assert event["row_count"] == 48
    assert event["entity_count"] == 2
    assert event["period_count"] == 24
    assert event["scope"] == "all_interfaces"
    assert event["grain"] == "date_hour_interface"


def test_isone_rt_hrl_scheduled_interchange_skips_incomplete_readiness(monkeypatch):
    captured: list[dict[str, object]] = []

    monkeypatch.setattr(
        rt_hrl_scheduled_interchange,
        "emit_data_availability_event",
        lambda **kwargs: captured.append(kwargs),
    )

    events = rt_hrl_scheduled_interchange._emit_data_availability_events(
        df=_availability_frame(hours=23, interfaces=("A",)),
        run_id="run-1",
        database="stage_db",
    )

    assert events == []
    assert captured == []


def _availability_frame(hours: int, interfaces: tuple[str, ...]) -> pd.DataFrame:
    rows = []
    for hour in range(1, hours + 1):
        for interface_name in interfaces:
            rows.append(
                {
                    "local_date": pd.Timestamp("2026-06-12").date(),
                    "local_hour_ending": hour,
                    "interface_name": interface_name,
                    "actual_interchange": 1.0,
                    "purchases": 1.0,
                    "sales": 0.0,
                }
            )
    return pd.DataFrame(rows)
