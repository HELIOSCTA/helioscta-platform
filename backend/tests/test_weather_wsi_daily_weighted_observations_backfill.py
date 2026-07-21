from __future__ import annotations

from datetime import date

import pandas as pd

from backend.backfills.weather.wsi import daily_weighted_observations


def test_wsi_daily_weighted_observations_backfill_dry_run(monkeypatch):
    called = False

    def fake_main(**_kwargs):
        nonlocal called
        called = True

    monkeypatch.setattr(daily_weighted_observations.source, "main", fake_main)

    result = daily_weighted_observations.main(
        start_date="2026-07-14",
        end_date="2026-07-15",
        dry_run=True,
    )

    assert called is False
    assert result.pipeline_name == "wsi_daily_weighted_observations"
    assert result.days_requested == 2
    assert result.rows_processed == 0
    assert result.status == "dry_run"
    assert result.region == "NA"
    assert result.dry_run is True


def test_wsi_daily_weighted_observations_backfill_calls_orchestration(monkeypatch):
    calls: list[dict[str, object]] = []

    def fake_main(**kwargs):
        calls.append(kwargs)
        return {
            "temperature": pd.DataFrame([{"entity_id": "PJM"}]),
            "degree_day": pd.DataFrame(
                [{"entity_id": "CONUS"}, {"entity_id": "EAST"}]
            ),
            "events": {},
        }

    monkeypatch.setattr(daily_weighted_observations.source, "main", fake_main)

    result = daily_weighted_observations.main(
        start_date=date(2026, 7, 14),
        end_date=date(2026, 7, 15),
        database="stage_db",
    )

    assert result.rows_processed == 3
    assert len(calls) == 1
    assert calls[0]["start_date"] == date(2026, 7, 14)
    assert calls[0]["end_date"] == date(2026, 7, 15)
    assert calls[0]["database"] == "stage_db"
    assert calls[0]["run_mode"] == "backfill"
    assert calls[0]["metadata"] == {
        "run_mode": "backfill",
        "backfill_workflow": "wsi_daily_weighted_observations",
        "backfill_start_date": "2026-07-14",
        "backfill_end_date": "2026-07-15",
        "backfill_region": "NA",
    }
