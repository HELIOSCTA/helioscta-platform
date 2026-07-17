from __future__ import annotations

from datetime import date

import pandas as pd
import pytest

from backend.backfills.power.caiso import da_lmps


def test_caiso_da_lmps_backfill_dry_run():
    result = da_lmps.main(
        start_date="2026-07-01",
        end_date="2026-07-03",
        dry_run=True,
    )

    assert result.pipeline_name == "da_lmps"
    assert result.start_date == date(2026, 7, 1)
    assert result.end_date == date(2026, 7, 3)
    assert result.days_requested == 3
    assert result.rows_processed == 0
    assert result.status == "dry_run"
    assert result.dry_run is True


def test_caiso_da_lmps_backfill_rejects_too_large_window():
    with pytest.raises(ValueError, match="max_days"):
        da_lmps.main(
            start_date="2026-07-01",
            end_date="2026-07-03",
            max_days=2,
            dry_run=True,
        )


def test_caiso_da_lmps_backfill_calls_orchestration_with_backfill_metadata(
    monkeypatch,
):
    calls: list[dict[str, object]] = []

    def fake_workflow_main(**kwargs):
        calls.append(kwargs)
        return pd.DataFrame([{"row": 1}, {"row": 2}])

    monkeypatch.setattr(da_lmps.workflow, "main", fake_workflow_main)

    result = da_lmps.main(
        start_date="2026-07-01",
        end_date="2026-07-02",
        database="stage_db",
        request_delay_seconds=0,
    )

    assert result.status == "success"
    assert result.rows_processed == 4
    assert len(calls) == 2
    assert calls[0]["start_date"] == date(2026, 7, 1)
    assert calls[0]["end_date"] == date(2026, 7, 1)
    assert calls[0]["database"] == "stage_db"
    assert calls[0]["run_mode"] == "backfill"
    assert calls[0]["metadata"] == {
        "run_mode": "backfill",
        "backfill_workflow": "da_lmps",
        "backfill_start_date": "2026-07-01",
        "backfill_end_date": "2026-07-02",
        "backfill_trading_date": "2026-07-01",
    }
    assert calls[1]["start_date"] == date(2026, 7, 2)
    assert calls[1]["end_date"] == date(2026, 7, 2)
    assert calls[1]["metadata"]["backfill_trading_date"] == "2026-07-02"
