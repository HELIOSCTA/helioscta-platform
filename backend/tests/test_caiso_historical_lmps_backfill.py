from __future__ import annotations

from datetime import date

import pandas as pd
import pytest

from backend.backfills.power.caiso import historical_lmps


def test_date_chunks_splits_range_by_chunk_days():
    assert historical_lmps._date_chunks(
        start_date=date(2026, 7, 1),
        end_date=date(2026, 7, 7),
        chunk_days=3,
    ) == (
        (date(2026, 7, 1), date(2026, 7, 3)),
        (date(2026, 7, 4), date(2026, 7, 6)),
        (date(2026, 7, 7), date(2026, 7, 7)),
    )


def test_historical_lmps_dry_run_chunks_selected_feeds():
    result = historical_lmps.main(
        start_date="2026-07-01",
        da_end_date="2026-07-03",
        rt_end_date="2026-07-02",
        feeds=("da", "rt"),
        chunk_days=2,
        dry_run=True,
        database="stage_db",
    )

    assert result.status == "dry_run"
    assert result.dry_run is True
    assert result.rows_processed == 0
    assert result.days_requested == 5
    assert result.chunks_requested == 3
    assert [(feed.feed_name, feed.chunks_requested) for feed in result.feed_results] == [
        ("da", 2),
        ("rt", 1),
    ]


def test_historical_feed_chunk_calls_pull_and_upsert_with_metadata(monkeypatch):
    calls: list[dict[str, object]] = []

    class FakeCaisoScrape:
        DEFAULT_NODES = ("TH_NP15_GEN-APND", "TH_SP15_GEN-APND")

        @staticmethod
        def _upsert(df, database=None):
            calls.append({"method": "upsert", "df": df, "database": database})

    def fake_pull_bulk_lmps_for_trading_date(**kwargs):
        calls.append({"method": "pull", **kwargs})
        return pd.DataFrame({"row_id": [1, 2]})

    monkeypatch.setattr(
        historical_lmps.bulk_oasis,
        "pull_bulk_lmps_for_trading_date",
        fake_pull_bulk_lmps_for_trading_date,
    )

    result = historical_lmps._run_feed_chunk(
        config=historical_lmps.FeedConfig(
            feed_name="da",
            workflow_name="caiso_da_lmps_historical",
            bulk_prefix="DAM_LMP",
            source_query_name="DAM_LMP",
            source_version=12,
            target_table="caiso.da_lmps",
            module=FakeCaisoScrape,
        ),
        start_date=date(2026, 7, 1),
        end_date=date(2026, 7, 2),
        requested_start_date=date(2026, 7, 1),
        requested_end_date=date(2026, 7, 31),
        dry_run=False,
        database="stage_db",
        request_delay_seconds=0,
    )

    assert result.status == "success"
    assert result.rows_processed == 4
    assert calls[0]["method"] == "pull"
    assert calls[0]["prefix"] == "DAM_LMP"
    assert calls[0]["source_query_name"] == "DAM_LMP"
    assert calls[0]["source_version"] == 12
    assert calls[0]["target_table"] == "caiso.da_lmps"
    assert calls[0]["trading_date"] == date(2026, 7, 1)
    assert calls[0]["nodes"] == ("TH_NP15_GEN-APND", "TH_SP15_GEN-APND")
    assert calls[0]["database"] == "stage_db"
    assert calls[0]["metadata"] == {
        "run_mode": "backfill",
        "backfill_family": "caiso_lmp_historical_backfill",
        "backfill_workflow": "caiso_da_lmps_historical",
        "backfill_start_date": "2026-07-01",
        "backfill_end_date": "2026-07-31",
        "backfill_chunk_start_date": "2026-07-01",
        "backfill_chunk_end_date": "2026-07-02",
        "backfill_business_date": "2026-07-01",
        "source_system": "caiso_historical_oasis_bulk",
    }
    assert "repair_family" not in calls[0]["metadata"]
    assert calls[1]["method"] == "upsert"
    assert calls[1]["database"] == "stage_db"
    assert calls[2]["trading_date"] == date(2026, 7, 2)
    assert calls[2]["metadata"]["backfill_business_date"] == "2026-07-02"
    assert calls[3]["method"] == "upsert"


def test_historical_lmps_rejects_unknown_feed():
    with pytest.raises(ValueError, match="Unsupported CAISO feed"):
        historical_lmps.main(
            start_date="2026-07-01",
            da_end_date="2026-07-02",
            feeds=("day_ahead",),
            dry_run=True,
        )


def test_historical_lmps_can_run_only_one_feed():
    result = historical_lmps.main(
        start_date="2026-07-01",
        da_end_date=None,
        rt_end_date="2026-07-02",
        feeds=("rt",),
        chunk_days=31,
        dry_run=True,
        database="stage_db",
    )

    assert result.da_end_date is None
    assert result.rt_end_date == date(2026, 7, 2)
    assert result.feed_results[0].feed_name == "rt"
    assert result.days_requested == 2
