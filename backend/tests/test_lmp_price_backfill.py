from __future__ import annotations

from datetime import date, datetime

import pandas as pd

from backend.backfills.power import lmp_price_backfill_7_day


def test_default_workflows_cover_promoted_lmp_sources():
    assert [workflow.name for workflow in lmp_price_backfill_7_day.DEFAULT_WORKFLOWS] == [
        "pjm_da_hrl_lmps",
        "pjm_rt_hrl_lmps",
        "pjm_rt_fivemin_hrl_lmps",
        "pjm_rt_unverified_hrl_lmps",
        "isone_da_hrl_lmps",
        "isone_rt_hrl_lmps_final",
        "isone_rt_hrl_lmps_prelim",
        "ercot_dam_stlmnt_pnt_prices",
        "ercot_settlement_point_prices",
    ]


def test_window_for_workflow_uses_lagged_seven_day_window():
    start_date, end_date = lmp_price_backfill_7_day._window_for_workflow(
        market_today=date(2026, 7, 17),
        lookback_days=7,
        end_lag_days=2,
    )

    assert start_date == date(2026, 7, 9)
    assert end_date == date(2026, 7, 15)


def test_main_runs_each_workflow_with_feed_specific_lags():
    calls: list[dict[str, object]] = []

    def make_runner(name: str):
        def runner(**kwargs):
            calls.append({"name": name, **kwargs})
            return lmp_price_backfill_7_day.BackfillResult(
                pipeline_name=name,
                start_date=kwargs["start_date"],
                end_date=kwargs["end_date"],
                days_requested=7,
                rows_processed=10,
                status="success",
            )

        return runner

    workflows = (
        lmp_price_backfill_7_day.PriceBackfillWorkflow(
            name="da",
            runner=make_runner("da"),
            end_lag_days=0,
        ),
        lmp_price_backfill_7_day.PriceBackfillWorkflow(
            name="rt_final",
            runner=make_runner("rt_final"),
            end_lag_days=2,
        ),
        lmp_price_backfill_7_day.PriceBackfillWorkflow(
            name="rt_prelim",
            runner=make_runner("rt_prelim"),
            end_lag_days=1,
        ),
    )

    result = lmp_price_backfill_7_day.main(
        workflows=workflows,
        now=datetime.fromisoformat("2026-07-17T18:15:00-04:00"),
        database="stage_db",
    )

    assert result == 0
    assert calls == [
        {
            "name": "da",
            "start_date": date(2026, 7, 11),
            "end_date": date(2026, 7, 17),
            "dry_run": False,
            "database": "stage_db",
        },
        {
            "name": "rt_final",
            "start_date": date(2026, 7, 9),
            "end_date": date(2026, 7, 15),
            "dry_run": False,
            "database": "stage_db",
        },
        {
            "name": "rt_prelim",
            "start_date": date(2026, 7, 10),
            "end_date": date(2026, 7, 16),
            "dry_run": False,
            "database": "stage_db",
        },
    ]


def test_main_continues_and_returns_nonzero_when_a_workflow_fails():
    calls: list[str] = []

    def good_runner(**kwargs):
        calls.append("good")
        return lmp_price_backfill_7_day.BackfillResult(
            pipeline_name="good",
            start_date=kwargs["start_date"],
            end_date=kwargs["end_date"],
            days_requested=7,
            rows_processed=1,
            status="success",
        )

    def bad_runner(**_kwargs):
        calls.append("bad")
        raise RuntimeError("boom")

    workflows = (
        lmp_price_backfill_7_day.PriceBackfillWorkflow(
            name="good",
            runner=good_runner,
            end_lag_days=1,
        ),
        lmp_price_backfill_7_day.PriceBackfillWorkflow(
            name="bad",
            runner=bad_runner,
            end_lag_days=1,
        ),
        lmp_price_backfill_7_day.PriceBackfillWorkflow(
            name="later",
            runner=good_runner,
            end_lag_days=1,
        ),
    )

    result = lmp_price_backfill_7_day.main(
        workflows=workflows,
        now=datetime.fromisoformat("2026-07-17T18:15:00-04:00"),
    )

    assert result == 1
    assert calls == ["good", "bad", "good"]


def test_isone_ercot_scrape_backfill_calls_pull_and_upsert_with_metadata():
    calls: list[dict[str, object]] = []

    class FakeScrape:
        API_SCRAPE_NAME = "fake_lmp_source"

        @staticmethod
        def _pull(**kwargs):
            calls.append({"method": "pull", **kwargs})
            return pd.DataFrame({"row_id": [1, 2]})

        @staticmethod
        def _upsert(df, database=None):
            calls.append({"method": "upsert", "df": df, "database": database})

    result = lmp_price_backfill_7_day._run_isone_ercot_scrape_backfill(
        module=FakeScrape,
        start_date=date(2026, 7, 9),
        end_date=date(2026, 7, 10),
        database="stage_db",
    )

    assert result == lmp_price_backfill_7_day.BackfillResult(
        pipeline_name="fake_lmp_source",
        start_date=date(2026, 7, 9),
        end_date=date(2026, 7, 10),
        days_requested=2,
        rows_processed=4,
        status="success",
    )
    assert calls[0]["method"] == "pull"
    assert calls[0]["start_date"] == datetime(2026, 7, 9)
    assert calls[0]["database"] == "stage_db"
    assert calls[0]["metadata"] == {
        "run_mode": "backfill",
        "backfill_workflow": "fake_lmp_source",
        "backfill_start_date": "2026-07-09",
        "backfill_end_date": "2026-07-10",
        "repair_family": "lmp_price_backfill_7_day",
        "backfill_business_date": "2026-07-09",
    }
    assert calls[1]["method"] == "upsert"
    assert calls[2]["start_date"] == datetime(2026, 7, 10)
    assert calls[3]["method"] == "upsert"


def test_isone_ercot_scrape_backfill_passes_settlement_points():
    calls: list[dict[str, object]] = []

    class FakeScrape:
        API_SCRAPE_NAME = "fake_ercot_source"

        @staticmethod
        def _pull(**kwargs):
            calls.append(kwargs)
            return pd.DataFrame()

        @staticmethod
        def _upsert(df, database=None):
            raise AssertionError("empty frames should not be upserted")

    result = lmp_price_backfill_7_day._run_isone_ercot_scrape_backfill(
        module=FakeScrape,
        start_date=date(2026, 7, 9),
        end_date=date(2026, 7, 9),
        settlement_points=("HB_NORTH", "HB_SOUTH"),
    )

    assert result.rows_processed == 0
    assert calls[0]["start_date"] == datetime(2026, 7, 9)
    assert calls[0]["end_date"] == datetime(2026, 7, 9)
    assert calls[0]["settlement_points"] == ("HB_NORTH", "HB_SOUTH")


def test_pjm_main_backfill_calls_scrape_main_with_backfill_metadata():
    calls: list[dict[str, object]] = []

    class FakePjmScrape:
        API_SCRAPE_NAME = "fake_pjm_source"

        @staticmethod
        def main(**kwargs):
            calls.append(kwargs)
            return pd.DataFrame({"row_id": [1, 2, 3]})

    result = lmp_price_backfill_7_day._run_pjm_main_scrape_backfill(
        module=FakePjmScrape,
        start_date=date(2026, 7, 9),
        end_date=date(2026, 7, 9),
        database="stage_db",
    )

    assert result.rows_processed == 3
    assert calls[0]["start_date"] == datetime(2026, 7, 9)
    assert calls[0]["end_date"] == datetime(2026, 7, 9)
    assert calls[0]["database"] == "stage_db"
    assert calls[0]["run_mode"] == "backfill"
    assert calls[0]["metadata"]["repair_family"] == "lmp_price_backfill_7_day"
    assert calls[0]["metadata"]["backfill_business_date"] == "2026-07-09"


def test_pjm_rt_fivemin_backfill_calls_pull_and_upsert_with_metadata(monkeypatch):
    calls: list[dict[str, object]] = []

    def fake_pull(**kwargs):
        calls.append({"method": "pull", **kwargs})
        return pd.DataFrame({"row_id": [1, 2]})

    def fake_upsert(df, database=None):
        calls.append({"method": "upsert", "df": df, "database": database})

    monkeypatch.setattr(lmp_price_backfill_7_day.pjm_rt_fivemin_hrl_lmps, "_pull", fake_pull)
    monkeypatch.setattr(
        lmp_price_backfill_7_day.pjm_rt_fivemin_hrl_lmps,
        "_upsert",
        fake_upsert,
    )

    result = lmp_price_backfill_7_day._run_pjm_rt_fivemin_scrape_backfill(
        start_date=date(2026, 7, 9),
        end_date=date(2026, 7, 9),
        database="stage_db",
    )

    assert result.rows_processed == 2
    assert calls[0]["method"] == "pull"
    assert calls[0]["start_date"] == "2026-07-09 00:00"
    assert calls[0]["end_date"] == "2026-07-09 23:55"
    assert calls[0]["database"] == "stage_db"
    assert calls[0]["metadata"]["repair_family"] == "lmp_price_backfill_7_day"
    assert calls[1]["method"] == "upsert"
    assert calls[1]["database"] == "stage_db"


def test_scrape_backfill_supports_dry_run():
    class FakeScrape:
        API_SCRAPE_NAME = "fake_lmp_source"

        @staticmethod
        def _pull(**_kwargs):
            raise AssertionError("dry run should not pull")

    result = lmp_price_backfill_7_day._run_isone_ercot_scrape_backfill(
        module=FakeScrape,
        start_date=date(2026, 7, 9),
        end_date=date(2026, 7, 15),
        dry_run=True,
    )

    assert result == lmp_price_backfill_7_day.BackfillResult(
        pipeline_name="fake_lmp_source",
        start_date=date(2026, 7, 9),
        end_date=date(2026, 7, 15),
        days_requested=7,
        rows_processed=0,
        status="dry_run",
        dry_run=True,
    )
