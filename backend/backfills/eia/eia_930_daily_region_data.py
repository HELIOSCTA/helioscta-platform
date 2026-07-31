"""Manual backfill runner for EIA-930 daily region data."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
import time
from typing import Any

from backend import credentials
from backend.orchestration.eia import eia_930_daily_region_data as workflow


API_SCRAPE_NAME = workflow.API_SCRAPE_NAME
DEFAULT_START_DATE = datetime.now(timezone.utc).date() - timedelta(days=31)
DEFAULT_END_DATE = datetime.now(timezone.utc).date()
DEFAULT_MAX_DAYS = 366
DEFAULT_CHUNK_DAYS = 31
DEFAULT_REQUEST_DELAY_SECONDS = 4.0


@dataclass(frozen=True)
class BackfillResult:
    pipeline_name: str
    start_date: date
    end_date: date
    days_requested: int
    rows_processed: int
    status: str
    dry_run: bool = False


def main(
    start_date: date | datetime | str = DEFAULT_START_DATE,
    end_date: date | datetime | str = DEFAULT_END_DATE,
    max_days: int = DEFAULT_MAX_DAYS,
    chunk_days: int = DEFAULT_CHUNK_DAYS,
    allow_future: bool = False,
    dry_run: bool = False,
    database: str | None = None,
    timezones: tuple[str, ...] = workflow.scrape.DEFAULT_TIMEZONES,
    types: tuple[str, ...] = workflow.scrape.DEFAULT_TYPES,
    respondents: tuple[str, ...] | None = workflow.scrape.DEFAULT_RESPONDENTS,
    request_delay_seconds: float = DEFAULT_REQUEST_DELAY_SECONDS,
    metadata: dict[str, Any] | None = None,
) -> BackfillResult:
    """Replay EIA-930 daily region data with idempotent upserts."""
    start = _normalize_date(start_date)
    end = _normalize_date(end_date)
    days_requested = _validate_window(
        start_date=start,
        end_date=end,
        max_days=max_days,
        allow_future=allow_future,
    )
    if chunk_days < 1:
        raise ValueError("chunk_days must be at least 1.")

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

    database = database or credentials.AZURE_POSTGRESQL_DB_NAME
    total_rows = 0
    current_start = start
    while current_start <= end:
        current_end = min(current_start + timedelta(days=chunk_days - 1), end)
        frame = workflow.main(
            start_date=current_start.isoformat(),
            end_date=current_end.isoformat(),
            timezones=timezones,
            types=types,
            respondents=respondents,
            database=database,
            run_mode="backfill",
            metadata={
                "backfill_workflow": API_SCRAPE_NAME,
                "backfill_start_date": start.isoformat(),
                "backfill_end_date": end.isoformat(),
                "backfill_chunk_start": current_start.isoformat(),
                "backfill_chunk_end_date": current_end.isoformat(),
                **(metadata or {}),
            },
        )
        total_rows += 0 if frame is None else len(frame)
        current_start = current_end + timedelta(days=1)
        if current_start <= end and request_delay_seconds > 0:
            time.sleep(request_delay_seconds)

    return BackfillResult(
        pipeline_name=API_SCRAPE_NAME,
        start_date=start,
        end_date=end,
        days_requested=days_requested,
        rows_processed=total_rows,
        status="success",
    )


def _normalize_date(value: date | datetime | str) -> date:
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    return date.fromisoformat(value)


def _validate_window(
    *,
    start_date: date,
    end_date: date,
    max_days: int,
    allow_future: bool,
    today: date | None = None,
) -> int:
    if max_days < 1:
        raise ValueError("max_days must be at least 1.")
    if start_date > end_date:
        raise ValueError("start_date must be on or before end_date.")

    today = today or datetime.now(timezone.utc).date()
    if not allow_future and end_date > today:
        raise ValueError(
            "Backfill end_date cannot be in the future unless allow_future=True."
        )

    days_requested = (end_date - start_date).days + 1
    if days_requested > max_days:
        raise ValueError(
            f"Backfill window is {days_requested} days; max_days is {max_days}."
        )
    return days_requested


if __name__ == "__main__":
    result = main()
    print(result)
    raise SystemExit(0 if result.status in {"success", "dry_run"} else 1)
