"""Manual backfill runner for cached Clear Street EOD transaction CSVs."""

from __future__ import annotations

import fnmatch
import time
from dataclasses import dataclass
from pathlib import Path

import pandas as pd

from backend import credentials
from backend.scrapes.clear_street import transactions as source
from backend.utils.ops_logging import log_api_fetch, redact_secrets

API_SCRAPE_NAME = source.API_SCRAPE_NAME
OPERATION_NAME = f"{API_SCRAPE_NAME}_local_cache_backfill"
PROVIDER = source.SOURCE_SYSTEM
DEFAULT_LOCAL_DIR = source.DEFAULT_LOCAL_DIR
DEFAULT_FILE_PATTERN = source.DEFAULT_FILE_PATTERN
DEFAULT_BATCH_SIZE = 25


@dataclass(frozen=True)
class ClearStreetCacheBackfillResult:
    pipeline_name: str
    operation_name: str
    local_dir: str
    files_processed: int
    rows_processed: int
    rows_written: int
    status: str
    dry_run: bool = False
    min_trade_date_from_sftp: str | None = None
    max_trade_date_from_sftp: str | None = None
    first_file: str | None = None
    last_file: str | None = None


def main(
    local_dir: str | Path | None = DEFAULT_LOCAL_DIR,
    file_pattern: str = DEFAULT_FILE_PATTERN,
    start_trade_date: str | None = None,
    end_trade_date: str | None = None,
    batch_size: int = DEFAULT_BATCH_SIZE,
    max_files: int | None = None,
    dry_run: bool = False,
    database: str | None = None,
) -> ClearStreetCacheBackfillResult:
    """Parse cached Clear Street CSVs and upsert them with production keys."""
    if batch_size < 1:
        raise ValueError("batch_size must be at least 1.")
    if max_files is not None and max_files < 1:
        raise ValueError("max_files must be at least 1 when provided.")

    database = database or credentials.AZURE_POSTGRESQL_DB_NAME
    resolved_dir = source.resolve_local_dir(local_dir)
    start = (
        source.normalize_trade_date_for_sftp(start_trade_date)
        if start_trade_date is not None
        else None
    )
    end = (
        source.normalize_trade_date_for_sftp(end_trade_date)
        if end_trade_date is not None
        else None
    )
    if start is not None and end is not None and start > end:
        raise ValueError("start_trade_date must be on or before end_trade_date.")

    paths = _matching_cache_files(
        local_dir=resolved_dir,
        file_pattern=file_pattern,
        start_trade_date=start,
        end_trade_date=end,
    )
    if max_files is not None:
        paths = paths[:max_files]

    started_at = time.perf_counter()
    status = "success"
    error_type: str | None = None
    error_message: str | None = None
    files_processed = 0
    rows_processed = 0
    rows_written = 0
    trade_dates: list[str] = []
    first_file = paths[0].name if paths else None
    last_file = paths[-1].name if paths else None

    try:
        batch_frames: list[pd.DataFrame] = []
        for path in paths:
            parsed = source.parse_transaction_filename(path.name)
            trade_dates.append(str(parsed["trade_date_from_sftp"]))
            frame = source.parse_transaction_file(path)
            files_processed += 1
            rows_processed += int(len(frame))
            if not dry_run and not frame.empty:
                batch_frames.append(frame)
            if len(batch_frames) >= batch_size:
                rows_written += _upsert_batch(
                    frames=batch_frames,
                    database=database,
                )
                batch_frames.clear()

        if not dry_run and batch_frames:
            rows_written += _upsert_batch(frames=batch_frames, database=database)

        result = ClearStreetCacheBackfillResult(
            pipeline_name=API_SCRAPE_NAME,
            operation_name=OPERATION_NAME,
            local_dir=str(resolved_dir),
            files_processed=files_processed,
            rows_processed=rows_processed,
            rows_written=rows_written,
            status="dry_run" if dry_run else status,
            dry_run=dry_run,
            min_trade_date_from_sftp=min(trade_dates) if trade_dates else None,
            max_trade_date_from_sftp=max(trade_dates) if trade_dates else None,
            first_file=first_file,
            last_file=last_file,
        )
        return result
    except Exception as exc:
        status = "failure"
        error_type = type(exc).__name__
        error_message = redact_secrets(str(exc))
        raise
    finally:
        if not dry_run:
            elapsed_ms = round((time.perf_counter() - started_at) * 1000)
            _log_backfill_attempt(
                status=status,
                elapsed_ms=elapsed_ms,
                rows_processed=rows_processed,
                rows_written=rows_written,
                files_processed=files_processed,
                local_dir=resolved_dir,
                file_pattern=file_pattern,
                start_trade_date=start,
                end_trade_date=end,
                max_files=max_files,
                batch_size=batch_size,
                first_file=first_file,
                last_file=last_file,
                error_type=error_type,
                error_message=error_message,
                database=database,
            )


def _matching_cache_files(
    *,
    local_dir: Path,
    file_pattern: str,
    start_trade_date: str | None,
    end_trade_date: str | None,
) -> list[Path]:
    if not local_dir.exists():
        raise FileNotFoundError(f"Clear Street cache directory not found: {local_dir}")

    matched: list[tuple[str, str, Path]] = []
    for path in local_dir.iterdir():
        if not path.is_file() or not fnmatch.fnmatchcase(path.name, file_pattern):
            continue
        parsed = source.parse_transaction_filename(path.name)
        trade_date = str(parsed["trade_date_from_sftp"])
        upload_timestamp = str(parsed["sftp_upload_timestamp"])
        if start_trade_date is not None and trade_date < start_trade_date:
            continue
        if end_trade_date is not None and trade_date > end_trade_date:
            continue
        matched.append((trade_date, upload_timestamp, path))

    return [path for _, _, path in sorted(matched)]


def _upsert_batch(*, frames: list[pd.DataFrame], database: str | None) -> int:
    df = pd.concat(frames, ignore_index=True)
    if df.empty:
        return 0
    source._upsert_transactions(df=df, database=database)
    return int(len(df))


def _log_backfill_attempt(
    *,
    status: str,
    elapsed_ms: int,
    rows_processed: int,
    rows_written: int,
    files_processed: int,
    local_dir: Path,
    file_pattern: str,
    start_trade_date: str | None,
    end_trade_date: str | None,
    max_files: int | None,
    batch_size: int,
    first_file: str | None,
    last_file: str | None,
    error_type: str | None,
    error_message: str | None,
    database: str | None,
) -> None:
    log_api_fetch(
        actor_type="backend",
        provider=PROVIDER,
        pipeline_name=API_SCRAPE_NAME,
        operation_name=OPERATION_NAME,
        target_table=source.TARGET_TABLE_FQN,
        method="LOCAL_FILE",
        target_host="local-cache",
        target_path=str(local_dir),
        status=status,
        http_status=None,
        elapsed_ms=elapsed_ms,
        rows_returned=rows_processed,
        rows_written=rows_written,
        error_type=error_type,
        error_message=error_message,
        metadata={
            "run_mode": "backfill",
            "backfill_workflow": OPERATION_NAME,
            "file_pattern": file_pattern,
            "files_processed": files_processed,
            "start_trade_date": start_trade_date,
            "end_trade_date": end_trade_date,
            "max_files": max_files,
            "batch_size": batch_size,
            "first_file": first_file,
            "last_file": last_file,
        },
        database=database,
    )


if __name__ == "__main__":
    result = main()
    print(result)
    raise SystemExit(0 if result.status in {"success", "dry_run"} else 1)
