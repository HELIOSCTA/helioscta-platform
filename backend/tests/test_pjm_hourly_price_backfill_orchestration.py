from __future__ import annotations

from datetime import date, datetime

from backend.backfills.power.pjm._shared import BackfillResult
from backend.orchestration.power.pjm import hourly_price_backfill_7_day


def test_default_workflows_cover_promoted_hourly_lmp_price_backfills():
    assert [workflow.name for workflow in hourly_price_backfill_7_day.DEFAULT_WORKFLOWS] == [
        "da_hrl_lmps",
        "rt_hrl_lmps",
        "rt_unverified_hrl_lmps",
    ]


def test_market_today_uses_eastern_timezone_for_aware_utc_datetime():
    assert hourly_price_backfill_7_day._market_today(
        datetime.fromisoformat("2026-06-29T05:30:00+00:00")
    ) == date(2026, 6, 29)


def test_window_for_workflow_uses_lagged_seven_day_window():
    start_date, end_date = hourly_price_backfill_7_day._window_for_workflow(
        market_today=date(2026, 6, 29),
        lookback_days=7,
        end_lag_days=2,
    )

    assert start_date == date(2026, 6, 21)
    assert end_date == date(2026, 6, 27)


def test_main_runs_each_workflow_with_feed_specific_lags():
    calls: list[dict[str, object]] = []

    def make_runner(name: str):
        def runner(**kwargs):
            calls.append({"name": name, **kwargs})
            return BackfillResult(
                pipeline_name=name,
                start_date=kwargs["start_date"],
                end_date=kwargs["end_date"],
                days_requested=7,
                rows_processed=10,
                status="success",
            )

        return runner

    workflows = (
        hourly_price_backfill_7_day.PriceBackfillWorkflow(
            name="da_hrl_lmps",
            runner=make_runner("da_hrl_lmps"),
            end_lag_days=0,
        ),
        hourly_price_backfill_7_day.PriceBackfillWorkflow(
            name="rt_hrl_lmps",
            runner=make_runner("rt_hrl_lmps"),
            end_lag_days=2,
        ),
        hourly_price_backfill_7_day.PriceBackfillWorkflow(
            name="rt_unverified_hrl_lmps",
            runner=make_runner("rt_unverified_hrl_lmps"),
            end_lag_days=1,
        ),
    )

    result = hourly_price_backfill_7_day.main(
        workflows=workflows,
        now=datetime.fromisoformat("2026-06-29T02:00:00-04:00"),
        database="stage_db",
    )

    assert result == 0
    assert calls == [
        {
            "name": "da_hrl_lmps",
            "start_date": date(2026, 6, 23),
            "end_date": date(2026, 6, 29),
            "dry_run": False,
            "database": "stage_db",
        },
        {
            "name": "rt_hrl_lmps",
            "start_date": date(2026, 6, 21),
            "end_date": date(2026, 6, 27),
            "dry_run": False,
            "database": "stage_db",
        },
        {
            "name": "rt_unverified_hrl_lmps",
            "start_date": date(2026, 6, 22),
            "end_date": date(2026, 6, 28),
            "dry_run": False,
            "database": "stage_db",
        },
    ]


def test_main_continues_and_returns_nonzero_when_a_workflow_fails():
    calls: list[str] = []

    def good_runner(**kwargs):
        calls.append("good")
        return BackfillResult(
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
        hourly_price_backfill_7_day.PriceBackfillWorkflow(
            name="good",
            runner=good_runner,
            end_lag_days=1,
        ),
        hourly_price_backfill_7_day.PriceBackfillWorkflow(
            name="bad",
            runner=bad_runner,
            end_lag_days=1,
        ),
        hourly_price_backfill_7_day.PriceBackfillWorkflow(
            name="later",
            runner=good_runner,
            end_lag_days=1,
        ),
    )

    result = hourly_price_backfill_7_day.main(
        workflows=workflows,
        now=datetime.fromisoformat("2026-06-29T02:00:00-04:00"),
    )

    assert result == 1
    assert calls == ["good", "bad", "good"]
