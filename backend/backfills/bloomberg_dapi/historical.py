"""Manual backfill runner for Bloomberg DAPI daily historical values."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
import time

import pandas as pd

from backend import credentials
from backend.orchestration.bloomberg_dapi import historical as workflow
from backend.orchestration.bloomberg_dapi import tickers
from backend.scrapes.bloomberg_dapi import config, symbols

API_SCRAPE_NAME = workflow.API_SCRAPE_NAME
DEFAULT_START_DATE = datetime.now(timezone.utc).date() - timedelta(days=1)
DEFAULT_END_DATE = DEFAULT_START_DATE
DEFAULT_MAX_DAYS = 366
DEFAULT_CHUNK_DAYS = 31
DEFAULT_REQUEST_DELAY_SECONDS = 2.0


@dataclass(frozen=True)
class BackfillResult:
    pipeline_name: str
    start_date: date
    end_date: date
    days_requested: int
    rows_processed: int
    status: str
    dry_run: bool = False
    ticker_rows_processed: int = 0
    chunks_processed: int = 0


def normalize_date(value: date | datetime | str) -> date:
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    return date.fromisoformat(value)


def validate_backfill_window(
    *,
    start_date: date,
    end_date: date,
    max_days: int,
    allow_future: bool = False,
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


def _iter_date_chunks(
    *,
    start_date: date,
    end_date: date,
    chunk_days: int,
) -> list[tuple[date, date]]:
    if chunk_days < 1:
        raise ValueError("chunk_days must be at least 1.")

    chunks: list[tuple[date, date]] = []
    current_start = start_date
    while current_start <= end_date:
        current_end = min(current_start + timedelta(days=chunk_days - 1), end_date)
        chunks.append((current_start, current_end))
        current_start = current_end + timedelta(days=1)
    return chunks


def _rows_processed(frame: pd.DataFrame | None) -> int:
    if frame is None:
        return 0
    return int(len(frame))


def _default_security_count(securities: list[str] | list[tuple[str, str]] | None) -> int:
    if securities is None:
        return len(symbols.get_securities())
    return len(securities)


def main(
    start_date: date | datetime | str = DEFAULT_START_DATE,
    end_date: date | datetime | str = DEFAULT_END_DATE,
    max_days: int = DEFAULT_MAX_DAYS,
    allow_future: bool = False,
    dry_run: bool = False,
    securities: list[str] | list[tuple[str, str]] | None = None,
    fields: list[str] | None = None,
    chunk_days: int = DEFAULT_CHUNK_DAYS,
    request_delay_seconds: float = DEFAULT_REQUEST_DELAY_SECONDS,
    refresh_tickers: bool = True,
    enrich_reference_data: bool = True,
    host: str = config.BBG_HOST,
    port: int = config.BBG_PORT,
    request_timeout_seconds: int = config.DEFAULT_REQUEST_TIMEOUT_SECONDS,
    database: str | None = None,
) -> BackfillResult:
    """Replay Bloomberg DAPI daily values with production upsert semantics."""
    start = normalize_date(start_date)
    end = normalize_date(end_date)
    days_requested = validate_backfill_window(
        start_date=start,
        end_date=end,
        max_days=max_days,
        allow_future=allow_future,
    )
    chunks = _iter_date_chunks(
        start_date=start,
        end_date=end,
        chunk_days=chunk_days,
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
            ticker_rows_processed=0,
            chunks_processed=0,
        )

    ticker_rows = 0
    if refresh_tickers:
        ticker_frame = tickers.main(
            database=database,
            run_mode="backfill",
            enrich_reference_data=enrich_reference_data,
            host=host,
            port=port,
            request_timeout_seconds=request_timeout_seconds,
            metadata={
                "backfill_workflow": API_SCRAPE_NAME,
                "backfill_start_date": start.isoformat(),
                "backfill_end_date": end.isoformat(),
            },
        )
        ticker_rows = _rows_processed(ticker_frame)

    total_rows = 0
    for chunk_number, (chunk_start, chunk_end) in enumerate(chunks, start=1):
        frame = workflow.main(
            securities=securities,
            fields=fields,
            start_date=chunk_start,
            end_date=chunk_end,
            host=host,
            port=port,
            request_timeout_seconds=request_timeout_seconds,
            database=database,
            run_mode="backfill",
            metadata={
                "backfill_workflow": API_SCRAPE_NAME,
                "backfill_start_date": start.isoformat(),
                "backfill_end_date": end.isoformat(),
                "backfill_chunk_number": chunk_number,
                "backfill_chunk_start_date": chunk_start.isoformat(),
                "backfill_chunk_end_date": chunk_end.isoformat(),
                "backfill_security_count": _default_security_count(securities),
            },
        )
        total_rows += _rows_processed(frame)
        if chunk_number < len(chunks) and request_delay_seconds > 0:
            time.sleep(request_delay_seconds)

    return BackfillResult(
        pipeline_name=API_SCRAPE_NAME,
        start_date=start,
        end_date=end,
        days_requested=days_requested,
        rows_processed=total_rows,
        status="success",
        ticker_rows_processed=ticker_rows,
        chunks_processed=len(chunks),
    )


if __name__ == "__main__":
    result = main()
    print(result)
    raise SystemExit(0 if result.status in {"success", "dry_run"} else 1)
