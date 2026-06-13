"""Manual backfill runner for PJM day-ahead hourly LMPs."""

from __future__ import annotations

from datetime import date, datetime, timedelta, timezone

from backend import credentials
from backend.orchestration.power.pjm import da_hrl_lmps
from backend.orchestration.power.pjm._backfill import (
    BackfillResult,
    backfill_metadata,
    normalize_date,
    rows_processed,
    start_of_day,
    validate_backfill_window,
)

API_SCRAPE_NAME = da_hrl_lmps.API_SCRAPE_NAME
DEFAULT_START_DATE = (datetime.now(timezone.utc).date() - timedelta(days=1))
DEFAULT_END_DATE = DEFAULT_START_DATE
DEFAULT_MAX_DAYS = 31


def main(
    start_date: date | datetime | str = DEFAULT_START_DATE,
    end_date: date | datetime | str = DEFAULT_END_DATE,
    max_days: int = DEFAULT_MAX_DAYS,
    allow_future: bool = False,
    dry_run: bool = False,
    database: str | None = None,
) -> BackfillResult:
    """Replay DA hourly LMPs into the production table with idempotent upserts."""
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

    frame = da_hrl_lmps.main(
        start_date=start_of_day(start).strftime("%Y-%m-%d 00:00"),
        end_date=start_of_day(end).strftime("%Y-%m-%d 23:00"),
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
