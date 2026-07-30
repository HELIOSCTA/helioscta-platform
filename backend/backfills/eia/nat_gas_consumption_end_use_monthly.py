"""Manual backfill runner for EIA monthly natural gas consumption."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, timezone
import time
from typing import Any

from backend import credentials
from backend.orchestration.eia import (
    nat_gas_consumption_end_use_monthly as workflow,
)


API_SCRAPE_NAME = workflow.API_SCRAPE_NAME
DEFAULT_START_MONTH = "2001-01"
_DEFAULT_END_DATE = datetime.now(timezone.utc).date().replace(day=1)
DEFAULT_END_MONTH = f"{_DEFAULT_END_DATE.year:04d}-{_DEFAULT_END_DATE.month:02d}"
DEFAULT_MAX_MONTHS = 360
DEFAULT_CHUNK_MONTHS = 60
DEFAULT_REQUEST_DELAY_SECONDS = 2.0


@dataclass(frozen=True)
class BackfillResult:
    pipeline_name: str
    start_month: str
    end_month: str
    months_requested: int
    rows_processed: int
    status: str
    dry_run: bool = False


def main(
    start_month: date | datetime | str = DEFAULT_START_MONTH,
    end_month: date | datetime | str = DEFAULT_END_MONTH,
    max_months: int = DEFAULT_MAX_MONTHS,
    chunk_months: int = DEFAULT_CHUNK_MONTHS,
    allow_future: bool = False,
    dry_run: bool = False,
    database: str | None = None,
    request_delay_seconds: float = DEFAULT_REQUEST_DELAY_SECONDS,
    metadata: dict[str, Any] | None = None,
) -> BackfillResult:
    """Replay EIA monthly natural gas consumption with idempotent upserts."""
    start = _normalize_month(start_month)
    end = _normalize_month(end_month)
    months_requested = _validate_window(
        start_month=start,
        end_month=end,
        max_months=max_months,
        allow_future=allow_future,
    )
    if chunk_months < 1:
        raise ValueError("chunk_months must be at least 1.")

    if dry_run:
        return BackfillResult(
            pipeline_name=API_SCRAPE_NAME,
            start_month=_format_month(start),
            end_month=_format_month(end),
            months_requested=months_requested,
            rows_processed=0,
            status="dry_run",
            dry_run=True,
        )

    database = database or credentials.AZURE_POSTGRESQL_DB_NAME
    total_rows = 0
    current_start = start
    while current_start <= end:
        current_end = min(_add_months(current_start, chunk_months - 1), end)
        frame = workflow.main(
            start_month=_format_month(current_start),
            end_month=_format_month(current_end),
            database=database,
            run_mode="backfill",
            metadata={
                "backfill_workflow": API_SCRAPE_NAME,
                "backfill_start_month": _format_month(start),
                "backfill_end_month": _format_month(end),
                "backfill_chunk_start": _format_month(current_start),
                "backfill_chunk_end_month": _format_month(current_end),
                **(metadata or {}),
            },
        )
        total_rows += 0 if frame is None else len(frame)
        current_start = _add_months(current_end, 1)
        if current_start <= end and request_delay_seconds > 0:
            time.sleep(request_delay_seconds)

    return BackfillResult(
        pipeline_name=API_SCRAPE_NAME,
        start_month=_format_month(start),
        end_month=_format_month(end),
        months_requested=months_requested,
        rows_processed=total_rows,
        status="success",
    )


def _normalize_month(value: date | datetime | str) -> date:
    if isinstance(value, datetime):
        return value.date().replace(day=1)
    if isinstance(value, date):
        return value.replace(day=1)
    parsed = datetime.strptime(value[:7], "%Y-%m")
    return date(parsed.year, parsed.month, 1)


def _validate_window(
    *,
    start_month: date,
    end_month: date,
    max_months: int,
    allow_future: bool,
    today: date | None = None,
) -> int:
    if max_months < 1:
        raise ValueError("max_months must be at least 1.")
    if start_month > end_month:
        raise ValueError("start_month must be on or before end_month.")

    today = today or datetime.now(timezone.utc).date().replace(day=1)
    if not allow_future and end_month > today:
        raise ValueError(
            "Backfill end_month cannot be in the future unless allow_future=True."
        )

    months_requested = _month_diff(start_month, end_month) + 1
    if months_requested > max_months:
        raise ValueError(
            f"Backfill window is {months_requested} months; max_months is {max_months}."
        )
    return months_requested


def _add_months(value: date, months: int) -> date:
    month_index = value.month - 1 + months
    year = value.year + month_index // 12
    month = month_index % 12 + 1
    return date(year, month, 1)


def _month_diff(start: date, end: date) -> int:
    return (end.year - start.year) * 12 + end.month - start.month


def _format_month(value: date) -> str:
    return f"{value.year:04d}-{value.month:02d}"


if __name__ == "__main__":
    result = main()
    print(result)
    raise SystemExit(0 if result.status in {"success", "dry_run"} else 1)
