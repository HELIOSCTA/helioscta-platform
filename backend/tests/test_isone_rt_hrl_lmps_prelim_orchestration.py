from __future__ import annotations

from datetime import date

import pandas as pd

from backend.orchestration.power.isone import rt_hrl_lmps_prelim


def test_isone_rt_hrl_lmps_prelim_expected_period_count_handles_normal_and_dst_days():
    assert rt_hrl_lmps_prelim._expected_period_count_for_date(date(2026, 6, 13)) == 24
    assert rt_hrl_lmps_prelim._expected_period_count_for_date(date(2026, 3, 8)) == 23
    assert rt_hrl_lmps_prelim._expected_period_count_for_date(date(2026, 11, 1)) == 25


def test_isone_rt_hrl_lmps_prelim_event_key():
    assert (
        rt_hrl_lmps_prelim._data_availability_event_key(date(2026, 6, 13))
        == "isone_rt_hrl_lmps_prelim:data_ready:2026-06-13:internal_hub"
    )


def test_isone_rt_hrl_lmps_prelim_scheduled_default_targets_prior_operating_day():
    assert rt_hrl_lmps_prelim.DEFAULT_LOOKBACK_DAYS == 1


def test_isone_rt_hrl_lmps_prelim_emits_readiness_event_for_complete_rows(monkeypatch):
    captured: list[dict[str, object]] = []

    def fake_emit_data_availability_event(**kwargs):
        captured.append(kwargs)
        return {"id": 1, "event_key": kwargs["event_key"], "created": True}

    monkeypatch.setattr(
        rt_hrl_lmps_prelim,
        "emit_data_availability_event",
        fake_emit_data_availability_event,
    )

    events = rt_hrl_lmps_prelim._emit_data_availability_events(
        df=_availability_frame(hours=24, locations=(".H.INTERNAL_HUB",)),
        run_id="run-1",
        database="stage_db",
    )

    assert events == [
        {
            "id": 1,
            "event_key": "isone_rt_hrl_lmps_prelim:data_ready:2026-06-13:internal_hub",
            "created": True,
        }
    ]
    event = captured[0]
    assert event["dataset"] == "isone_rt_hrl_lmps_prelim"
    assert event["source_table"] == "isone.rt_hrl_lmps_prelim"
    assert event["scope"] == "internal_hub"
    assert event["row_count"] == 24
    assert event["entity_count"] == 1
    assert event["period_count"] == 24
    assert event["completeness_status"] == "complete"


def test_isone_rt_hrl_lmps_prelim_skips_readiness_event_for_incomplete_rows(monkeypatch):
    captured: list[dict[str, object]] = []
    monkeypatch.setattr(
        rt_hrl_lmps_prelim,
        "emit_data_availability_event",
        lambda **kwargs: captured.append(kwargs),
    )

    events = rt_hrl_lmps_prelim._emit_data_availability_events(
        df=_availability_frame(hours=23, locations=(".H.INTERNAL_HUB",)),
        run_id="run-1",
        database="stage_db",
    )

    assert events == []
    assert captured == []


def _availability_frame(hours: int, locations: tuple[str, ...]) -> pd.DataFrame:
    rows = []
    for hour in range(1, hours + 1):
        for location in locations:
            rows.append(
                {
                    "date": pd.Timestamp("2026-06-13").date(),
                    "hour_ending": hour,
                    "location": location,
                    "lmp": 20.0,
                }
            )
    return pd.DataFrame(rows)
