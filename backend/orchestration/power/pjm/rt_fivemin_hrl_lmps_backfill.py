"""Manual backfill runner for PJM verified five-minute RT HRL LMPs."""

from __future__ import annotations

from collections.abc import Iterable
from datetime import date, datetime, timedelta, timezone

from dateutil.relativedelta import relativedelta

from backend import credentials
from backend.orchestration.power.pjm import rt_fivemin_hrl_lmps
from backend.orchestration.power.pjm._backfill import (
    BackfillResult,
    backfill_metadata,
    normalize_date,
    rows_processed,
    start_of_day,
    validate_backfill_window,
)
from backend.scrapes.power.pjm.pricing_filters import DEFAULT_PRICING_NODE_TYPES

API_SCRAPE_NAME = rt_fivemin_hrl_lmps.API_SCRAPE_NAME
DEFAULT_START_DATE = (datetime.now(timezone.utc).date() - timedelta(days=1))
DEFAULT_END_DATE = DEFAULT_START_DATE
DEFAULT_MAX_DAYS = 7


def main(
    start_date: date | datetime | str = DEFAULT_START_DATE,
    end_date: date | datetime | str = DEFAULT_END_DATE,
    max_days: int = DEFAULT_MAX_DAYS,
    allow_future: bool = False,
    dry_run: bool = False,
    pnode_types: str | Iterable[str] | None = DEFAULT_PRICING_NODE_TYPES,
    pnode_id_batch_size: int = rt_fivemin_hrl_lmps.scrape.DEFAULT_PNODE_ID_BATCH_SIZE,
    database: str | None = None,
) -> BackfillResult:
    """Replay verified five-minute RT HRL LMPs with production upsert semantics."""
    start = normalize_date(start_date)
    end = normalize_date(end_date)
    days_requested = validate_backfill_window(
        start_date=start,
        end_date=end,
        max_days=max_days,
        allow_future=allow_future,
    )
    database = database or credentials.AZURE_POSTGRESQL_DB_NAME

    if dry_run:
        return BackfillResult(
            pipeline_name=API_SCRAPE_NAME,
            start_date=start,
            end_date=end,
            days_requested=days_requested,
            rows_processed=0,
            status="dry_run",
            dry_run=True,
        )

    frame = rt_fivemin_hrl_lmps.main(
        start_date=start_of_day(start),
        end_date=start_of_day(end),
        delta=relativedelta(days=1),
        pnode_types=pnode_types,
        pnode_id_batch_size=pnode_id_batch_size,
        database=database,
        run_mode="backfill",
        metadata=backfill_metadata(
            start_date=start,
            end_date=end,
            workflow=API_SCRAPE_NAME,
        ),
    )
    return BackfillResult(
        pipeline_name=API_SCRAPE_NAME,
        start_date=start,
        end_date=end,
        days_requested=days_requested,
        rows_processed=rows_processed(frame),
        status="success",
    )


if __name__ == "__main__":
    result = main()
    print(result)
    raise SystemExit(0 if result.status in {"success", "dry_run"} else 1)
