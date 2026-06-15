from __future__ import annotations

from datetime import date, datetime

import pandas as pd

from backend.backfills.power.pjm import gen_outages_by_type


def test_gen_outages_backfill_dry_run_does_not_call_scrape(monkeypatch):
    called = False

    def fake_main(**_kwargs):
        nonlocal called
        called = True

    monkeypatch.setattr(gen_outages_by_type.source, "main", fake_main)

    result = gen_outages_by_type.main(
        start_date="2026-06-10",
        end_date="2026-06-10",
        dry_run=True,
    )

    assert called is False
    assert result.pipeline_name == "gen_outages_by_type"
    assert result.start_date == date(2026, 6, 10)
    assert result.end_date == date(2026, 6, 10)
    assert result.days_requested == 1
    assert result.status == "dry_run"
    assert result.dry_run is True


def test_gen_outages_backfill_calls_scrape_once_per_execution_date(monkeypatch):
    calls: list[dict[str, object]] = []

    def fake_main(**kwargs):
        calls.append(kwargs)
        return pd.DataFrame([{"row": 1}, {"row": 2}, {"row": 3}])

    monkeypatch.setattr(gen_outages_by_type.source, "main", fake_main)

    result = gen_outages_by_type.main(
        start_date=date(2026, 6, 10),
        end_date=date(2026, 6, 11),
        database="stage_db",
    )

    assert result.pipeline_name == "gen_outages_by_type"
    assert result.days_requested == 2
    assert result.rows_processed == 6
    assert len(calls) == 2
    assert calls[0]["start_date"] == datetime(2026, 6, 10)
    assert calls[0]["end_date"] == datetime(2026, 6, 10)
    assert calls[1]["start_date"] == datetime(2026, 6, 11)
    assert calls[1]["end_date"] == datetime(2026, 6, 11)
    assert calls[0]["database"] == "stage_db"
    assert calls[0]["delta"].days == 1
    assert calls[0]["metadata"]["run_mode"] == "backfill"
    assert calls[0]["metadata"]["backfill_workflow"] == "gen_outages_by_type"
    assert calls[0]["metadata"]["backfill_start_date"] == "2026-06-10"
    assert calls[0]["metadata"]["backfill_end_date"] == "2026-06-11"
    assert calls[0]["metadata"]["backfill_execution_date"] == "2026-06-10"
    assert calls[1]["metadata"]["backfill_execution_date"] == "2026-06-11"
