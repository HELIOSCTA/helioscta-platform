from __future__ import annotations

from datetime import date, datetime

import pandas as pd

from backend.orchestration.power.pjm import rt_hrl_lmps


def test_rt_hrl_orchestration_calls_scrape_with_post_publish_metadata(monkeypatch):
    captured: dict[str, object] = {}
    waited: dict[str, object] = {}

    def fake_wait(**kwargs):
        waited.update(kwargs)
        return pd.DataFrame()

    def fake_main(**kwargs):
        captured.update(kwargs)

    monkeypatch.setattr(
        rt_hrl_lmps,
        "_wait_for_available_market_day_logged",
        fake_wait,
    )
    monkeypatch.setattr(rt_hrl_lmps.scrape, "main", fake_main)

    result = rt_hrl_lmps.main(target_date="2026-06-29", database="stage_db")

    assert result == 0
    assert waited["target_date"] == date(2026, 6, 29)
    assert waited["database"] == "stage_db"
    assert waited["metadata"] == {
        "run_mode": "scheduled_post_publish",
        "scheduler": "helios-pjm-rt-hrl-lmps.timer",
        "schedule_reason": "poll_pjm_verified_rt_hourly_lmp_publication_window",
        "target_market_date": "2026-06-29",
        "poll_ceiling_seconds": 18000,
        "poll_wait_seconds": 300,
    }
    assert captured["database"] == "stage_db"
    assert captured["run_mode"] == "scheduled_post_publish"
    assert captured["metadata"] == {
        "scheduler": "helios-pjm-rt-hrl-lmps.timer",
        "schedule_reason": "poll_pjm_verified_rt_hourly_lmp_publication_window",
        "target_market_date": "2026-06-29",
        "poll_ceiling_seconds": 18000,
        "poll_wait_seconds": 300,
    }


def test_rt_hrl_orchestration_allows_metadata_override(monkeypatch):
    captured: dict[str, object] = {}

    def fake_main(**kwargs):
        captured.update(kwargs)

    monkeypatch.setattr(
        rt_hrl_lmps,
        "_wait_for_available_market_day_logged",
        lambda **kwargs: pd.DataFrame(),
    )
    monkeypatch.setattr(rt_hrl_lmps.scrape, "main", fake_main)

    rt_hrl_lmps.main(
        target_date=date(2026, 6, 29),
        database="stage_db",
        run_mode="manual",
        metadata={"manual_reason": "operator"},
    )

    assert captured["database"] == "stage_db"
    assert captured["run_mode"] == "manual"
    assert captured["metadata"] == {
        "scheduler": "helios-pjm-rt-hrl-lmps.timer",
        "schedule_reason": "poll_pjm_verified_rt_hourly_lmp_publication_window",
        "target_market_date": "2026-06-29",
        "poll_ceiling_seconds": 18000,
        "poll_wait_seconds": 300,
        "manual_reason": "operator",
    }


def test_rt_hrl_orchestration_default_target_skips_weekend(monkeypatch):
    class FakeDatetime(datetime):
        @classmethod
        def now(cls, tz=None):
            return cls(2026, 6, 29, 11, 30, tzinfo=tz)

    monkeypatch.setattr(rt_hrl_lmps, "datetime", FakeDatetime)

    assert rt_hrl_lmps._target_market_date() == date(2026, 6, 26)


def test_rt_hrl_market_day_shape_requires_complete_periods_and_unique_keys():
    rows = [
        {
            "datetime_beginning_utc": pd.Timestamp("2026-06-29 04:00"),
            "datetime_beginning_ept": pd.Timestamp("2026-06-29 00:00"),
            "pnode_id": 1,
            "pnode_name": "WESTERN HUB",
            "row_is_current": True,
            "version_nbr": 1,
        },
        {
            "datetime_beginning_utc": pd.Timestamp("2026-06-29 05:00"),
            "datetime_beginning_ept": pd.Timestamp("2026-06-29 01:00"),
            "pnode_id": 1,
            "pnode_name": "WESTERN HUB",
            "row_is_current": True,
            "version_nbr": 1,
        },
    ]

    shape = rt_hrl_lmps._market_day_shape(pd.DataFrame(rows), date(2026, 6, 29))

    assert shape["is_available"] is False
    assert shape["period_count"] == 2
    assert shape["expected_period_count"] == 24
