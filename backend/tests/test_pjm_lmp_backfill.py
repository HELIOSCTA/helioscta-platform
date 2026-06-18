from __future__ import annotations

from datetime import date, datetime

import pandas as pd
import pytest

from backend.backfills.power.pjm import (
    da_hrl_lmps,
    hrl_load_metered,
    hrl_load_prelim,
    rt_hrl_lmps,
    rt_unverified_hrl_lmps,
)
from backend.backfills.power.pjm import _shared
from backend.scrapes.power.pjm import client


def test_backfill_window_rejects_future_dates():
    with pytest.raises(ValueError, match="future"):
        _shared.validate_backfill_window(
            start_date=date(2026, 6, 13),
            end_date=date(2026, 6, 14),
            max_days=7,
            today=date(2026, 6, 13),
        )


def test_backfill_window_rejects_too_many_days():
    with pytest.raises(ValueError, match="max_days"):
        _shared.validate_backfill_window(
            start_date=date(2026, 6, 1),
            end_date=date(2026, 6, 10),
            max_days=7,
            today=date(2026, 6, 13),
        )


def test_da_backfill_dry_run_does_not_call_workflow(monkeypatch):
    called = False

    def fake_main(**_kwargs):
        nonlocal called
        called = True

    monkeypatch.setattr(da_hrl_lmps.source, "main", fake_main)

    result = da_hrl_lmps.main(
        start_date="2026-06-10",
        end_date="2026-06-10",
        dry_run=True,
    )

    assert called is False
    assert result.pipeline_name == "da_hrl_lmps"
    assert result.start_date == date(2026, 6, 10)
    assert result.end_date == date(2026, 6, 10)
    assert result.days_requested == 1
    assert result.status == "dry_run"
    assert result.dry_run is True


def test_da_backfill_calls_scrape_once_per_day_with_backfill_metadata(monkeypatch):
    calls: list[dict[str, object]] = []

    def fake_main(**kwargs):
        calls.append(kwargs)
        return pd.DataFrame([{"row": 1}, {"row": 2}])

    monkeypatch.setattr(da_hrl_lmps.source, "main", fake_main)

    result = da_hrl_lmps.main(
        start_date=date(2026, 6, 10),
        end_date=date(2026, 6, 11),
        database="stage_db",
    )

    assert result.rows_processed == 4
    assert len(calls) == 2
    assert calls[0]["start_date"] == datetime(2026, 6, 10)
    assert calls[0]["end_date"] == datetime(2026, 6, 10)
    assert calls[1]["start_date"] == datetime(2026, 6, 11)
    assert calls[1]["end_date"] == datetime(2026, 6, 11)
    assert calls[0]["database"] == "stage_db"
    assert calls[0]["run_mode"] == "backfill"
    assert calls[0]["metadata"]["run_mode"] == "backfill"
    assert calls[0]["metadata"]["backfill_workflow"] == "da_hrl_lmps"
    assert calls[0]["metadata"]["backfill_start_date"] == "2026-06-10"
    assert calls[0]["metadata"]["backfill_end_date"] == "2026-06-11"
    assert calls[0]["metadata"]["backfill_business_date"] == "2026-06-10"


def test_verified_hourly_rt_backfill_calls_scrape_once_per_day(monkeypatch):
    calls: list[dict[str, object]] = []

    def fake_main(**kwargs):
        calls.append(kwargs)
        return pd.DataFrame([{"row": 1}, {"row": 2}])

    monkeypatch.setattr(rt_hrl_lmps.source, "main", fake_main)

    result = rt_hrl_lmps.main(
        start_date="2026-06-10",
        end_date="2026-06-11",
        database="stage_db",
    )

    assert result.pipeline_name == "rt_hrl_lmps"
    assert result.days_requested == 2
    assert result.rows_processed == 4
    assert len(calls) == 2
    assert calls[0]["start_date"] == datetime(2026, 6, 10)
    assert calls[0]["end_date"] == datetime(2026, 6, 10)
    assert calls[1]["start_date"] == datetime(2026, 6, 11)
    assert calls[1]["end_date"] == datetime(2026, 6, 11)
    assert calls[0]["database"] == "stage_db"
    assert calls[0]["run_mode"] == "backfill"
    assert calls[0]["metadata"]["backfill_workflow"] == "rt_hrl_lmps"
    assert calls[0]["metadata"]["backfill_start_date"] == "2026-06-10"
    assert calls[0]["metadata"]["backfill_end_date"] == "2026-06-11"
    assert calls[0]["metadata"]["backfill_business_date"] == "2026-06-10"


def test_unverified_hourly_rt_backfill_calls_scrape_once_per_day(monkeypatch):
    calls: list[dict[str, object]] = []

    def fake_main(**kwargs):
        calls.append(kwargs)
        return pd.DataFrame([{"row": 1}, {"row": 2}, {"row": 3}])

    monkeypatch.setattr(
        rt_unverified_hrl_lmps.source,
        "main",
        fake_main,
    )

    result = rt_unverified_hrl_lmps.main(
        start_date=date(2026, 6, 10),
        end_date=date(2026, 6, 11),
        pnode_types=("hub",),
        database="stage_db",
    )

    assert result.pipeline_name == "rt_unverified_hrl_lmps"
    assert result.days_requested == 2
    assert result.rows_processed == 6
    assert len(calls) == 2
    assert calls[0]["start_date"] == datetime(2026, 6, 10)
    assert calls[0]["end_date"] == datetime(2026, 6, 10)
    assert calls[0]["pnode_types"] == ("hub",)
    assert calls[0]["database"] == "stage_db"
    assert calls[0]["metadata"]["run_mode"] == "backfill"
    assert calls[0]["metadata"]["backfill_workflow"] == "rt_unverified_hrl_lmps"
    assert calls[1]["metadata"]["backfill_business_date"] == "2026-06-11"


def test_unverified_hourly_rt_backfill_dry_run_does_not_call_scrape(monkeypatch):
    called = False

    def fake_main(**_kwargs):
        nonlocal called
        called = True

    monkeypatch.setattr(
        rt_unverified_hrl_lmps.source,
        "main",
        fake_main,
    )

    result = rt_unverified_hrl_lmps.main(
        start_date="2026-06-10",
        end_date="2026-06-10",
        dry_run=True,
    )

    assert called is False
    assert result.pipeline_name == "rt_unverified_hrl_lmps"
    assert result.status == "dry_run"
    assert result.dry_run is True


def test_metered_hourly_load_backfill_calls_scrape_once_per_day(monkeypatch):
    calls: list[dict[str, object]] = []

    def fake_main(**kwargs):
        calls.append(kwargs)
        return pd.DataFrame([{"row": 1}, {"row": 2}])

    monkeypatch.setattr(hrl_load_metered.source, "main", fake_main)

    result = hrl_load_metered.main(
        start_date="2026-06-10",
        end_date="2026-06-11",
        database="stage_db",
    )

    assert result.pipeline_name == "hrl_load_metered"
    assert result.days_requested == 2
    assert result.rows_processed == 4
    assert len(calls) == 2
    assert calls[0]["start_date"] == datetime(2026, 6, 10)
    assert calls[0]["end_date"] == datetime(2026, 6, 10)
    assert calls[0]["database"] == "stage_db"
    assert calls[0]["metadata"]["run_mode"] == "backfill"
    assert calls[0]["metadata"]["backfill_workflow"] == "hrl_load_metered"
    assert calls[1]["metadata"]["backfill_business_date"] == "2026-06-11"


def test_preliminary_hourly_load_backfill_dry_run_does_not_call_scrape(monkeypatch):
    called = False

    def fake_main(**_kwargs):
        nonlocal called
        called = True

    monkeypatch.setattr(hrl_load_prelim.source, "main", fake_main)

    result = hrl_load_prelim.main(
        start_date="2026-06-10",
        end_date="2026-06-10",
        dry_run=True,
    )

    assert called is False
    assert result.pipeline_name == "hrl_load_prelim"
    assert result.status == "dry_run"
    assert result.dry_run is True


def test_preliminary_hourly_load_backfill_calls_scrape_once_per_day(monkeypatch):
    calls: list[dict[str, object]] = []

    def fake_main(**kwargs):
        calls.append(kwargs)
        return pd.DataFrame([{"row": 1}, {"row": 2}, {"row": 3}])

    monkeypatch.setattr(hrl_load_prelim.source, "main", fake_main)

    result = hrl_load_prelim.main(
        start_date=date(2026, 6, 10),
        end_date=date(2026, 6, 11),
        database="stage_db",
    )

    assert result.pipeline_name == "hrl_load_prelim"
    assert result.days_requested == 2
    assert result.rows_processed == 6
    assert len(calls) == 2
    assert calls[0]["start_date"] == datetime(2026, 6, 10)
    assert calls[0]["end_date"] == datetime(2026, 6, 10)
    assert calls[0]["database"] == "stage_db"
    assert calls[0]["metadata"]["run_mode"] == "backfill"
    assert calls[0]["metadata"]["backfill_workflow"] == "hrl_load_prelim"
    assert calls[1]["metadata"]["backfill_business_date"] == "2026-06-11"


def test_fetch_csv_merges_backfill_metadata_with_page_metadata(monkeypatch):
    captured: dict[str, object] = {}

    class FakeResponse:
        content = b"value\n1\n"
        text = "value\n1\n"

    def fake_make_get_request(_feed, _params, **kwargs):
        captured.update(kwargs)
        return FakeResponse()

    monkeypatch.setattr(client, "make_get_request", fake_make_get_request)

    df = client.fetch_csv(
        "test_feed",
        params={"field": "value"},
        metadata={"run_mode": "backfill", "backfill_start_date": "2026-06-10"},
    )

    assert len(df) == 1
    assert captured["metadata"] == {
        "run_mode": "backfill",
        "backfill_start_date": "2026-06-10",
        "page": 1,
        "start_row": 1,
        "page_size": client.DEFAULT_PAGE_SIZE,
    }
