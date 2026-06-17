from __future__ import annotations

import pandas as pd

from backend.orchestration.power.pjm import load_frcstd_7_day


def test_load_frcstd_7_day_orchestration_passes_scheduled_metadata(monkeypatch):
    captured: dict[str, object] = {}
    expected = pd.DataFrame([{"forecast_area": "RTO_COMBINED"}])

    def fake_main(**kwargs):
        captured.update(kwargs)
        return expected

    monkeypatch.setattr(load_frcstd_7_day.scrape, "main", fake_main)

    result = load_frcstd_7_day.main(
        database="stage_db",
        run_mode="manual",
        metadata={"source": "test"},
    )

    assert result is expected
    assert captured == {
        "database": "stage_db",
        "metadata": {"run_mode": "manual", "source": "test"},
    }
