"""Manual backfill runner for CAISO real-time five-minute LMPs."""

from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
import time

from backend import credentials
from backend.backfills.power.caiso._shared import (
    BackfillResult,
    backfill_metadata,
    normalize_date,
    rows_processed,
    validate_backfill_window,
)
from backend.orchestration.power.caiso import rt_lmps as workflow


API_SCRAPE_NAME = workflow.API_SCRAPE_NAME
DEFAULT_START_DATE = datetime.now(timezone.utc).date() - timedelta(days=1)
DEFAULT_END_DATE = DEFAULT_START_DATE
DEFAULT_MAX_DAYS = 31
DEFAULT_REQUEST_DELAY_SECONDS = 8.0


def main(
    start_date: date | datetime | str = DEFAULT_START_DATE,
    end_date: date | datetime | str = DEFAULT_END_DATE,
    max_days: int = DEFAULT_MAX_DAYS,
    allow_future: bool = False,
    dry_run: bool = False,
    database: str | None = None,
    request_delay_seconds: float = DEFAULT_REQUEST_DELAY_SECONDS,
) -> BackfillResult:
    """Replay CAISO RT five-minute LMPs with orchestration and idempotent upserts."""
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

    total_rows = 0
    current = start
    while current <= end:
        frame = workflow.main(
            start_date=current,
            end_date=current,
            database=database,
            run_mode="backfill",
            metadata=backfill_metadata(
                start_date=start,
                end_date=end,
                workflow=API_SCRAPE_NAME,
                extra={"backfill_trading_date": current.isoformat()},
            ),
        )
        total_rows += rows_processed(frame)
        current += timedelta(days=1)
        if current <= end and request_delay_seconds > 0:
            time.sleep(request_delay_seconds)

    return BackfillResult(
        pipeline_name=API_SCRAPE_NAME,
        start_date=start,
        end_date=end,
        days_requested=days_requested,
        rows_processed=total_rows,
        status="success",
    )


if __name__ == "__main__":
    result = main()
    print(result)
    raise SystemExit(0 if result.status in {"success", "dry_run"} else 1)
