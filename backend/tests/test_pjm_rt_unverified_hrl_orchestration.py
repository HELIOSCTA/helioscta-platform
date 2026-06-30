from __future__ import annotations

from datetime import datetime

from dateutil.relativedelta import relativedelta

from backend.orchestration.power.pjm import rt_unverified_hrl_lmps


def test_rt_unverified_orchestration_adds_scheduler_metadata(monkeypatch):
    captured: dict[str, object] = {}

    def fake_main(**kwargs):
        captured.update(kwargs)
        return "ok"

    monkeypatch.setattr(rt_unverified_hrl_lmps.scrape, "main", fake_main)

    start = datetime(2026, 6, 30, 0, 0)
    end = datetime(2026, 6, 30, 10, 0)
    result = rt_unverified_hrl_lmps.main(
        start_date=start,
        end_date=end,
        delta=relativedelta(hours=1),
        database="stage_db",
        metadata={"trigger": "test"},
    )

    assert result == "ok"
    assert captured["start_date"] == start
    assert captured["end_date"] == end
    assert captured["delta"] == relativedelta(hours=1)
    assert captured["database"] == "stage_db"
    assert captured["metadata"] == {
        "run_mode": "scheduled_hourly",
        "scheduler": "helios-pjm-hourly-bucket.timer",
        "schedule_reason": "hourly_pjm_bucket_refresh",
        "trigger": "test",
    }


def test_rt_unverified_orchestration_defaults_to_rolling_recent_window(monkeypatch):
    captured: dict[str, object] = {}

    class FakeDatetime(datetime):
        @classmethod
        def now(cls):
            return cls(2026, 6, 30, 10, 10)

    def fake_main(**kwargs):
        captured.update(kwargs)
        return None

    monkeypatch.setattr(rt_unverified_hrl_lmps, "datetime", FakeDatetime)
    monkeypatch.setattr(rt_unverified_hrl_lmps.scrape, "main", fake_main)

    rt_unverified_hrl_lmps.main()

    assert captured["start_date"] == datetime(2026, 6, 29, 10, 10)
    assert captured["end_date"] == datetime(2026, 6, 30, 10, 10)
    assert captured["metadata"]["run_mode"] == "scheduled_hourly"
