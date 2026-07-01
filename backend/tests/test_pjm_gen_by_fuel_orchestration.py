from __future__ import annotations

from datetime import datetime

from dateutil.relativedelta import relativedelta

from backend.orchestration.power.pjm import gen_by_fuel


def test_gen_by_fuel_orchestration_adds_hourly_bucket_metadata(monkeypatch):
    captured: dict[str, object] = {}
    start_date = datetime(2026, 7, 1)
    end_date = datetime(2026, 7, 2)
    delta = relativedelta(days=1)

    def fake_scrape_main(**kwargs):
        captured.update(kwargs)

    monkeypatch.setattr(gen_by_fuel.scrape, "main", fake_scrape_main)

    gen_by_fuel.main(
        start_date=start_date,
        end_date=end_date,
        delta=delta,
        database="stage_db",
        run_mode="manual_smoke",
        metadata={"trigger": "test"},
    )

    assert captured == {
        "start_date": start_date,
        "end_date": end_date,
        "delta": delta,
        "database": "stage_db",
        "metadata": {
            "run_mode": "manual_smoke",
            "scheduler": "helios-pjm-hourly-bucket.timer",
            "schedule_reason": "hourly_pjm_bucket_refresh",
            "trigger": "test",
        },
    }
