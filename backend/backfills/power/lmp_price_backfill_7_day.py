"""Run daily seven-day LMP price scrape repairs across promoted ISOs."""

from __future__ import annotations

import traceback
from collections.abc import Callable, Iterable
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta
from time import perf_counter
from typing import Any
from uuid import uuid4
from zoneinfo import ZoneInfo

import pandas as pd
from dateutil.relativedelta import relativedelta

from backend import credentials
from backend.scrapes.power.ercot import (
    dam_stlmnt_pnt_prices as ercot_dam_stlmnt_pnt_prices,
)
from backend.scrapes.power.ercot import (
    settlement_point_prices as ercot_settlement_point_prices,
)
from backend.scrapes.power.isone import da_hrl_lmps as isone_da_hrl_lmps
from backend.scrapes.power.isone import rt_hrl_lmps_final as isone_rt_hrl_lmps_final
from backend.scrapes.power.isone import rt_hrl_lmps_prelim as isone_rt_hrl_lmps_prelim
from backend.scrapes.power.pjm import da_hrl_lmps as pjm_da_hrl_lmps
from backend.scrapes.power.pjm import rt_fivemin_hrl_lmps as pjm_rt_fivemin_hrl_lmps
from backend.scrapes.power.pjm import rt_hrl_lmps as pjm_rt_hrl_lmps
from backend.scrapes.power.pjm import (
    rt_unverified_hrl_lmps as pjm_rt_unverified_hrl_lmps,
)

MARKET_TIMEZONE = ZoneInfo("America/New_York")
DEFAULT_LOOKBACK_DAYS = 7
REPAIR_FAMILY = "lmp_price_backfill_7_day"


@dataclass(frozen=True)
class BackfillResult:
    pipeline_name: str
    start_date: date
    end_date: date
    days_requested: int
    rows_processed: int
    status: str
    dry_run: bool = False


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


def _start_of_day(value: date) -> datetime:
    return datetime.combine(value, time.min)


def _rows_processed(frame: pd.DataFrame | None) -> int:
    if frame is None:
        return 0
    return int(len(frame))


def _backfill_metadata(
    *,
    start_date: date,
    end_date: date,
    workflow: str,
    business_date: date | None = None,
    extra: dict[str, Any] | None = None,
) -> dict[str, Any]:
    metadata = {
        "run_mode": "backfill",
        "backfill_workflow": workflow,
        "backfill_start_date": start_date.isoformat(),
        "backfill_end_date": end_date.isoformat(),
        "repair_family": REPAIR_FAMILY,
        **(extra or {}),
    }
    if business_date is not None:
        metadata["backfill_business_date"] = business_date.isoformat()
    return metadata


def _dry_run_result(
    *,
    pipeline_name: str,
    start_date: date,
    end_date: date,
) -> BackfillResult:
    return BackfillResult(
        pipeline_name=pipeline_name,
        start_date=start_date,
        end_date=end_date,
        days_requested=(end_date - start_date).days + 1,
        rows_processed=0,
        status="dry_run",
        dry_run=True,
    )


def _run_pjm_main_scrape_backfill(
    *,
    module: Any,
    start_date: date,
    end_date: date,
    dry_run: bool = False,
    database: str | None = None,
    supports_run_mode: bool = True,
    pnode_types: str | Iterable[str] | None = None,
) -> BackfillResult:
    pipeline_name = module.API_SCRAPE_NAME
    if dry_run:
        return _dry_run_result(
            pipeline_name=pipeline_name,
            start_date=start_date,
            end_date=end_date,
        )

    total_rows = 0
    current_date = start_date
    while current_date <= end_date:
        kwargs: dict[str, Any] = {
            "start_date": _start_of_day(current_date),
            "end_date": _start_of_day(current_date),
            "delta": relativedelta(days=1),
            "database": database,
            "metadata": _backfill_metadata(
                start_date=start_date,
                end_date=end_date,
                workflow=pipeline_name,
                business_date=current_date,
            ),
        }
        if supports_run_mode:
            kwargs["run_mode"] = "backfill"
        if pnode_types is not None:
            kwargs["pnode_types"] = pnode_types

        frame = module.main(**kwargs)
        total_rows += _rows_processed(frame)
        current_date += timedelta(days=1)

    return BackfillResult(
        pipeline_name=pipeline_name,
        start_date=start_date,
        end_date=end_date,
        days_requested=(end_date - start_date).days + 1,
        rows_processed=total_rows,
        status="success",
    )


def _run_pjm_rt_fivemin_scrape_backfill(
    *,
    start_date: date,
    end_date: date,
    dry_run: bool = False,
    database: str | None = None,
) -> BackfillResult:
    pipeline_name = pjm_rt_fivemin_hrl_lmps.API_SCRAPE_NAME
    if dry_run:
        return _dry_run_result(
            pipeline_name=pipeline_name,
            start_date=start_date,
            end_date=end_date,
        )

    run_id = str(uuid4())
    total_rows = 0
    current_date = start_date
    while current_date <= end_date:
        metadata = _backfill_metadata(
            start_date=start_date,
            end_date=end_date,
            workflow=pipeline_name,
            business_date=current_date,
        )
        df = pjm_rt_fivemin_hrl_lmps._pull(
            start_date=f"{current_date:%Y-%m-%d} 00:00",
            end_date=f"{current_date:%Y-%m-%d} 23:55",
            run_id=run_id,
            database=database,
            metadata=metadata,
        )
        if not df.empty:
            pjm_rt_fivemin_hrl_lmps._upsert(df, database=database)
            total_rows += int(len(df))
        current_date += timedelta(days=1)

    return BackfillResult(
        pipeline_name=pipeline_name,
        start_date=start_date,
        end_date=end_date,
        days_requested=(end_date - start_date).days + 1,
        rows_processed=total_rows,
        status="success",
    )


def _run_isone_ercot_scrape_backfill(
    *,
    module: Any,
    start_date: date,
    end_date: date,
    dry_run: bool = False,
    database: str | None = None,
    settlement_points: tuple[str, ...] | None = None,
) -> BackfillResult:
    pipeline_name = module.API_SCRAPE_NAME
    if dry_run:
        return _dry_run_result(
            pipeline_name=pipeline_name,
            start_date=start_date,
            end_date=end_date,
        )

    run_id = str(uuid4())
    total_rows = 0
    current_date = start_date
    while current_date <= end_date:
        scrape_date = _start_of_day(current_date)
        metadata = _backfill_metadata(
            start_date=start_date,
            end_date=end_date,
            workflow=pipeline_name,
            business_date=current_date,
        )
        if settlement_points is None:
            df = module._pull(
                start_date=scrape_date,
                run_id=run_id,
                database=database,
                metadata=metadata,
            )
        else:
            df = module._pull(
                start_date=scrape_date,
                end_date=scrape_date,
                settlement_points=settlement_points,
                run_id=run_id,
                database=database,
                metadata=metadata,
            )

        if not df.empty:
            module._upsert(df, database=database)
            total_rows += int(len(df))
        current_date += timedelta(days=1)

    return BackfillResult(
        pipeline_name=pipeline_name,
        start_date=start_date,
        end_date=end_date,
        days_requested=(end_date - start_date).days + 1,
        rows_processed=total_rows,
        status="success",
    )


def _run_pjm_da_hrl_lmps_backfill(**kwargs: Any) -> BackfillResult:
    return _run_pjm_main_scrape_backfill(module=pjm_da_hrl_lmps, **kwargs)


def _run_pjm_rt_hrl_lmps_backfill(**kwargs: Any) -> BackfillResult:
    return _run_pjm_main_scrape_backfill(module=pjm_rt_hrl_lmps, **kwargs)


def _run_pjm_rt_unverified_hrl_lmps_backfill(**kwargs: Any) -> BackfillResult:
    return _run_pjm_main_scrape_backfill(
        module=pjm_rt_unverified_hrl_lmps,
        supports_run_mode=False,
        pnode_types=pjm_rt_unverified_hrl_lmps.DEFAULT_PRICING_NODE_TYPES,
        **kwargs,
    )


def _run_isone_da_hrl_lmps_backfill(**kwargs: Any) -> BackfillResult:
    return _run_isone_ercot_scrape_backfill(module=isone_da_hrl_lmps, **kwargs)


def _run_isone_rt_hrl_lmps_final_backfill(**kwargs: Any) -> BackfillResult:
    return _run_isone_ercot_scrape_backfill(
        module=isone_rt_hrl_lmps_final,
        **kwargs,
    )


def _run_isone_rt_hrl_lmps_prelim_backfill(**kwargs: Any) -> BackfillResult:
    return _run_isone_ercot_scrape_backfill(
        module=isone_rt_hrl_lmps_prelim,
        **kwargs,
    )


def _run_ercot_dam_stlmnt_pnt_prices_backfill(**kwargs: Any) -> BackfillResult:
    return _run_isone_ercot_scrape_backfill(
        module=ercot_dam_stlmnt_pnt_prices,
        settlement_points=ercot_dam_stlmnt_pnt_prices.DEFAULT_SETTLEMENT_POINTS,
        **kwargs,
    )


def _run_ercot_settlement_point_prices_backfill(**kwargs: Any) -> BackfillResult:
    return _run_isone_ercot_scrape_backfill(
        module=ercot_settlement_point_prices,
        settlement_points=ercot_settlement_point_prices.DEFAULT_SETTLEMENT_POINTS,
        **kwargs,
    )


DEFAULT_WORKFLOWS: tuple[PriceBackfillWorkflow, ...] = (
    PriceBackfillWorkflow(
        name="pjm_da_hrl_lmps",
        runner=_run_pjm_da_hrl_lmps_backfill,
        end_lag_days=0,
    ),
    PriceBackfillWorkflow(
        name="pjm_rt_hrl_lmps",
        runner=_run_pjm_rt_hrl_lmps_backfill,
        end_lag_days=2,
    ),
    PriceBackfillWorkflow(
        name="pjm_rt_fivemin_hrl_lmps",
        runner=_run_pjm_rt_fivemin_scrape_backfill,
        end_lag_days=2,
    ),
    PriceBackfillWorkflow(
        name="pjm_rt_unverified_hrl_lmps",
        runner=_run_pjm_rt_unverified_hrl_lmps_backfill,
        end_lag_days=1,
    ),
    PriceBackfillWorkflow(
        name="isone_da_hrl_lmps",
        runner=_run_isone_da_hrl_lmps_backfill,
        end_lag_days=0,
    ),
    PriceBackfillWorkflow(
        name="isone_rt_hrl_lmps_final",
        runner=_run_isone_rt_hrl_lmps_final_backfill,
        end_lag_days=2,
    ),
    PriceBackfillWorkflow(
        name="isone_rt_hrl_lmps_prelim",
        runner=_run_isone_rt_hrl_lmps_prelim_backfill,
        end_lag_days=1,
    ),
    PriceBackfillWorkflow(
        name="ercot_dam_stlmnt_pnt_prices",
        runner=_run_ercot_dam_stlmnt_pnt_prices_backfill,
        end_lag_days=0,
    ),
    PriceBackfillWorkflow(
        name="ercot_settlement_point_prices",
        runner=_run_ercot_settlement_point_prices_backfill,
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
        print(f"LMP price backfill failed: {workflow.name}", flush=True)
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
    database = database or credentials.AZURE_POSTGRESQL_DB_NAME
    market_today = _market_today(now)
    print(
        "Starting global LMP price backfill repair for "
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
                "LMP price backfill "
                f"{result.status}: {result.workflow_name} "
                f"{result.start_date} to {result.end_date}; "
                f"days={result.days_requested}; rows={result.rows_processed}; "
                f"elapsed={result.elapsed_seconds:.1f}s",
                flush=True,
            )
        else:
            print(
                "LMP price backfill failed: "
                f"{result.workflow_name} "
                f"{result.start_date} to {result.end_date}; "
                f"elapsed={result.elapsed_seconds:.1f}s; error={result.error}",
                flush=True,
            )

    failures = [result for result in results if result.status not in {"success", "dry_run"}]
    print(
        "Completed global LMP price backfill repair: "
        f"{len(results) - len(failures)} succeeded, {len(failures)} failed",
        flush=True,
    )
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
