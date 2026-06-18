from __future__ import annotations

from datetime import date, datetime

import pandas as pd
import pytest

from backend.backfills.weather.wsi import hourly_observed
from backend.backfills.weather import _shared


def test_wsi_hourly_observed_backfill_dry_run_does_not_call_orchestration(monkeypatch):
    called = False

    def fake_main(**_kwargs):
        nonlocal called
        called = True

    monkeypatch.setattr(hourly_observed.source, "main", fake_main)

    result = hourly_observed.main(
        start_date="2026-06-17",
        end_date="2026-06-17",
        dry_run=True,
    )

    assert called is False
    assert result.pipeline_name == "wsi_hourly_observed_temperatures"
    assert result.days_requested == 1
    assert result.rows_processed == 0
    assert result.status == "dry_run"
    assert result.region == "PJM"
    assert result.dry_run is True


def test_wsi_hourly_observed_backfill_calls_orchestration_with_metadata(monkeypatch):
    calls: list[dict[str, object]] = []

    def fake_main(**kwargs):
        calls.append(kwargs)
        return pd.DataFrame([{"station_id": "PJM"}, {"station_id": "KDCA"}])

    monkeypatch.setattr(hourly_observed.source, "main", fake_main)

    result = hourly_observed.main(
        start_date=date(2026, 6, 16),
        end_date=date(2026, 6, 17),
        database="stage_db",
    )

    assert result.rows_processed == 2
    assert len(calls) == 1
    assert calls[0]["start_date"] == datetime(2026, 6, 16)
    assert calls[0]["end_date"] == datetime(2026, 6, 17)
    assert calls[0]["region"] == "PJM"
    assert calls[0]["database"] == "stage_db"
    assert calls[0]["run_mode"] == "backfill"
    assert calls[0]["metadata"] == {
        "run_mode": "backfill",
        "backfill_workflow": "wsi_hourly_observed_temperatures",
        "backfill_start_date": "2026-06-16",
        "backfill_end_date": "2026-06-17",
        "backfill_region": "PJM",
    }


def test_wsi_hourly_observed_backfill_rejects_future_dates():
    with pytest.raises(ValueError, match="future"):
        _shared.validate_backfill_window(
            start_date=date(2026, 6, 17),
            end_date=date(2026, 6, 18),
            max_days=7,
            today=date(2026, 6, 17),
        )
