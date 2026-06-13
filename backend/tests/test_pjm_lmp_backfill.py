from __future__ import annotations

from datetime import date, datetime

import pandas as pd
import pytest

from backend.orchestration.power.pjm import (
    da_hrl_lmps_backfill,
    rt_fivemin_hrl_lmps_backfill,
)
from backend.orchestration.power.pjm import _backfill
from backend.scrapes.power.pjm import client


def test_backfill_window_rejects_future_dates():
    with pytest.raises(ValueError, match="future"):
        _backfill.validate_backfill_window(
            start_date=date(2026, 6, 13),
            end_date=date(2026, 6, 14),
            max_days=7,
            today=date(2026, 6, 13),
        )


def test_backfill_window_rejects_too_many_days():
    with pytest.raises(ValueError, match="max_days"):
        _backfill.validate_backfill_window(
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

    monkeypatch.setattr(da_hrl_lmps_backfill.da_hrl_lmps, "main", fake_main)

    result = da_hrl_lmps_backfill.main(
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


def test_da_backfill_calls_production_workflow_with_backfill_metadata(monkeypatch):
    captured: dict[str, object] = {}

    def fake_main(**kwargs):
        captured.update(kwargs)
        return pd.DataFrame([{"row": 1}, {"row": 2}])

    monkeypatch.setattr(da_hrl_lmps_backfill.da_hrl_lmps, "main", fake_main)

    result = da_hrl_lmps_backfill.main(
        start_date=date(2026, 6, 10),
        end_date=date(2026, 6, 11),
        database="stage_db",
    )

    assert result.rows_processed == 2
    assert captured["start_date"] == "2026-06-10 00:00"
    assert captured["end_date"] == "2026-06-11 23:00"
    assert captured["database"] == "stage_db"
    assert captured["run_mode"] == "backfill"
    assert captured["metadata"]["run_mode"] == "backfill"
    assert captured["metadata"]["backfill_workflow"] == "da_hrl_lmps"
    assert captured["metadata"]["backfill_start_date"] == "2026-06-10"
    assert captured["metadata"]["backfill_end_date"] == "2026-06-11"


def test_rt_backfill_calls_production_workflow_with_backfill_metadata(monkeypatch):
    captured: dict[str, object] = {}

    def fake_main(**kwargs):
        captured.update(kwargs)
        return pd.DataFrame([{"row": 1}, {"row": 2}, {"row": 3}])

    monkeypatch.setattr(
        rt_fivemin_hrl_lmps_backfill.rt_fivemin_hrl_lmps,
        "main",
        fake_main,
    )

    result = rt_fivemin_hrl_lmps_backfill.main(
        start_date=datetime(2026, 6, 10, 12),
        end_date="2026-06-10",
        pnode_types=("hub",),
        database="stage_db",
    )

    assert result.rows_processed == 3
    assert captured["start_date"] == datetime(2026, 6, 10)
    assert captured["end_date"] == datetime(2026, 6, 10)
    assert captured["pnode_types"] == ("hub",)
    assert captured["database"] == "stage_db"
    assert captured["run_mode"] == "backfill"
    assert captured["metadata"]["run_mode"] == "backfill"
    assert captured["metadata"]["backfill_workflow"] == "rt_fivemin_hrl_lmps"


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
