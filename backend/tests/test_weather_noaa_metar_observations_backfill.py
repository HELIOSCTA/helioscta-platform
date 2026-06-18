from __future__ import annotations

import pandas as pd
import pytest

from backend.backfills.weather.noaa import metar_observations


def test_noaa_metar_backfill_dry_run_does_not_call_orchestration(monkeypatch):
    called = False

    def fake_main(**_kwargs):
        nonlocal called
        called = True

    monkeypatch.setattr(metar_observations.source, "main", fake_main)

    result = metar_observations.main(hours=72, dry_run=True)

    assert called is False
    assert result.pipeline_name == "noaa_metar_observations"
    assert result.hours_requested == 72
    assert result.rows_processed == 0
    assert result.status == "dry_run"
    assert result.region == "PJM"
    assert result.dry_run is True


def test_noaa_metar_backfill_calls_orchestration_with_metadata(monkeypatch):
    calls: list[dict[str, object]] = []

    def fake_main(**kwargs):
        calls.append(kwargs)
        return pd.DataFrame([{"station_id": "KDCA"}, {"station_id": "KPHL"}])

    monkeypatch.setattr(metar_observations.source, "main", fake_main)

    result = metar_observations.main(
        hours=360,
        database="stage_db",
        region="PJM",
    )

    assert result.rows_processed == 2
    assert result.hours_requested == 360
    assert len(calls) == 1
    assert calls[0]["region"] == "PJM"
    assert calls[0]["hours"] == 360
    assert calls[0]["database"] == "stage_db"
    assert calls[0]["run_mode"] == "backfill"
    assert calls[0]["metadata"] == {
        "run_mode": "backfill",
        "backfill_workflow": "noaa_metar_observations",
        "backfill_hours": 360,
        "backfill_region": "PJM",
        "backfill_type": "rolling_hours",
    }


def test_noaa_metar_backfill_rejects_hours_above_api_limit():
    with pytest.raises(ValueError, match="max_hours"):
        metar_observations.main(hours=361, max_hours=360, dry_run=True)


def test_noaa_metar_backfill_rejects_zero_hours():
    with pytest.raises(ValueError, match="at least 1"):
        metar_observations.main(hours=0, dry_run=True)
