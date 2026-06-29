"""Run nightly seven-day PJM hourly LMP price backfills."""

from __future__ import annotations

import traceback
from collections.abc import Callable
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from time import perf_counter
from zoneinfo import ZoneInfo

from backend.backfills.power.pjm import (
    da_hrl_lmps,
    rt_hrl_lmps,
    rt_unverified_hrl_lmps,
)
from backend.backfills.power.pjm._shared import BackfillResult

MARKET_TIMEZONE = ZoneInfo("America/New_York")
DEFAULT_LOOKBACK_DAYS = 7


@dataclass(frozen=True)
class PriceBackfillWorkflow:
    name: str
    runner: Callable[..., BackfillResult]
    end_lag_days: int


@dataclass(frozen=True)
class PriceBackfillRunSummary:
    workflow_name: str
    status: str
    start_date: date | None
    end_date: date | None
    days_requested: int
    rows_processed: int
    elapsed_seconds: float
    error: str | None = None


DEFAULT_WORKFLOWS: tuple[PriceBackfillWorkflow, ...] = (
    PriceBackfillWorkflow(
        name="da_hrl_lmps",
        runner=da_hrl_lmps.main,
        # DA prices for the current PJM market date are published the prior day.
        end_lag_days=0,
    ),
    PriceBackfillWorkflow(
        name="rt_hrl_lmps",
        runner=rt_hrl_lmps.main,
        # Verified RT hourly prices post after the nightly 02:00 EPT repair.
        end_lag_days=2,
    ),
    PriceBackfillWorkflow(
        name="rt_unverified_hrl_lmps",
        runner=rt_unverified_hrl_lmps.main,
        end_lag_days=1,
    ),
)


def _market_today(now: datetime | None = None) -> date:
    timestamp = now or datetime.now(tz=MARKET_TIMEZONE)
    if timestamp.tzinfo is None:
        timestamp = timestamp.replace(tzinfo=MARKET_TIMEZONE)
    else:
        timestamp = timestamp.astimezone(MARKET_TIMEZONE)
    return timestamp.date()


def _window_for_workflow(
    *,
    market_today: date,
    lookback_days: int,
    end_lag_days: int,
) -> tuple[date, date]:
    if lookback_days < 1:
        raise ValueError("lookback_days must be at least 1.")
    if end_lag_days < 0:
        raise ValueError("end_lag_days cannot be negative.")

    end_date = market_today - timedelta(days=end_lag_days)
    start_date = end_date - timedelta(days=lookback_days - 1)
    return start_date, end_date


def _run_workflow(
    workflow: PriceBackfillWorkflow,
    *,
    market_today: date,
    lookback_days: int,
    dry_run: bool,
    database: str | None,
) -> PriceBackfillRunSummary:
    start_date, end_date = _window_for_workflow(
        market_today=market_today,
        lookback_days=lookback_days,
        end_lag_days=workflow.end_lag_days,
    )
    started = perf_counter()
    try:
        result = workflow.runner(
            start_date=start_date,
            end_date=end_date,
            dry_run=dry_run,
            database=database,
        )
    except Exception as exc:
        elapsed = perf_counter() - started
        print(f"PJM hourly price backfill failed: {workflow.name}", flush=True)
        traceback.print_exc()
        return PriceBackfillRunSummary(
            workflow_name=workflow.name,
            status="failed",
            start_date=start_date,
            end_date=end_date,
            days_requested=lookback_days,
            rows_processed=0,
            elapsed_seconds=elapsed,
            error=str(exc),
        )

    elapsed = perf_counter() - started
    return PriceBackfillRunSummary(
        workflow_name=workflow.name,
        status=result.status,
        start_date=result.start_date,
        end_date=result.end_date,
        days_requested=result.days_requested,
        rows_processed=result.rows_processed,
        elapsed_seconds=elapsed,
    )


def main(
    lookback_days: int = DEFAULT_LOOKBACK_DAYS,
    workflows: tuple[PriceBackfillWorkflow, ...] = DEFAULT_WORKFLOWS,
    now: datetime | None = None,
    dry_run: bool = False,
    database: str | None = None,
) -> int:
    market_today = _market_today(now)
    print(
        "Starting PJM hourly price backfill repair for "
        f"{len(workflows)} workflows; market_today={market_today}; "
        f"lookback_days={lookback_days}; dry_run={dry_run}",
        flush=True,
    )

    results = [
        _run_workflow(
            workflow,
            market_today=market_today,
            lookback_days=lookback_days,
            dry_run=dry_run,
            database=database,
        )
        for workflow in workflows
    ]

    for result in results:
        if result.status in {"success", "dry_run"}:
            print(
                "PJM hourly price backfill "
                f"{result.status}: {result.workflow_name} "
                f"{result.start_date} to {result.end_date}; "
                f"days={result.days_requested}; rows={result.rows_processed}; "
                f"elapsed={result.elapsed_seconds:.1f}s",
                flush=True,
            )
        else:
            print(
                "PJM hourly price backfill failed: "
                f"{result.workflow_name} "
                f"{result.start_date} to {result.end_date}; "
                f"elapsed={result.elapsed_seconds:.1f}s; error={result.error}",
                flush=True,
            )

    failures = [result for result in results if result.status not in {"success", "dry_run"}]
    print(
        "Completed PJM hourly price backfill repair: "
        f"{len(results) - len(failures)} succeeded, {len(failures)} failed",
        flush=True,
    )
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
