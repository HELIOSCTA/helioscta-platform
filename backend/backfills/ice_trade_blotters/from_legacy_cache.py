"""Manual backfill runner for legacy cached ICE trade blotter .xls files."""
from __future__ import annotations

import shutil
import time
from dataclasses import dataclass
from datetime import date, datetime, timezone
from pathlib import Path

import pandas as pd

from backend import credentials
from backend.scrapes.ice_trade_blotters import settings
from backend.scrapes.ice_trade_blotters.scripts import (
    manage_csv_files,
    upsert_ice_trade_blotters,
)
from backend.utils.ops_logging import log_api_fetch, redact_secrets


API_SCRAPE_NAME = settings.API_SCRAPE_NAME
OPERATION_NAME = "ice_trade_blotters_legacy_cache_backfill"
PROVIDER = settings.SOURCE_SYSTEM
DEFAULT_LEGACY_SOURCE_DIR = Path(
    r"C:\Users\AidanKeaveny\Documents\github\helioscta-azure-backend"
    r"\backend\scrapes\ice_trade_blotters\csv\formatted_files"
)
DEFAULT_FORMATTED_FILES_DIR = settings.CSV_FORMATTED_FILES_DIR
DEFAULT_BATCH_SIZE = 10


@dataclass(frozen=True)
class IceTradeBlotterLegacyCacheFile:
    source_path: Path
    local_path: Path
    file_hash: str
    min_trade_date: date
    max_trade_date: date
    row_count: int


@dataclass(frozen=True)
class IceTradeBlotterBackfillResult:
    pipeline_name: str
    operation_name: str
    source_dir: str
    formatted_files_dir: str
    files_discovered: int
    files_copied: int
    files_skipped_existing: int
    files_processed: int
    rows_processed: int
    rows_written: int
    status: str
    dry_run: bool = False
    min_trade_date: str | None = None
    max_trade_date: str | None = None
    first_file: str | None = None
    last_file: str | None = None


def main(
    source_dir: str | Path = DEFAULT_LEGACY_SOURCE_DIR,
    formatted_files_dir: str | Path = DEFAULT_FORMATTED_FILES_DIR,
    start_trade_date: str | date | datetime | pd.Timestamp | None = None,
    end_trade_date: str | date | datetime | pd.Timestamp | None = None,
    batch_size: int = DEFAULT_BATCH_SIZE,
    max_files: int | None = None,
    dry_run: bool = False,
    database: str | None = None,
    schema: str = settings.TRADE_BLOTTERS_SCHEMA,
    table_name: str = settings.TRADE_BLOTTERS_TABLE,
    manifest_table: str = settings.FILE_MANIFEST_TABLE,
) -> IceTradeBlotterBackfillResult:
    """Copy legacy cached ICE blotters into the local cache and upsert rows."""
    if batch_size < 1:
        raise ValueError("batch_size must be at least 1.")
    if max_files is not None and max_files < 1:
        raise ValueError("max_files must be at least 1 when provided.")

    database = database or credentials.AZURE_POSTGRESQL_DB_NAME
    resolved_source_dir = Path(source_dir)
    resolved_formatted_dir = Path(formatted_files_dir)
    start = _normalize_trade_date(start_trade_date) if start_trade_date is not None else None
    end = _normalize_trade_date(end_trade_date) if end_trade_date is not None else None
    if start is not None and end is not None and start > end:
        raise ValueError("start_trade_date must be on or before end_trade_date.")

    legacy_files = _matching_legacy_files(
        source_dir=resolved_source_dir,
        formatted_files_dir=resolved_formatted_dir,
        start_trade_date=start,
        end_trade_date=end,
    )
    if max_files is not None:
        legacy_files = legacy_files[:max_files]

    started_at = time.perf_counter()
    status = "success"
    error_type: str | None = None
    error_message: str | None = None
    files_copied = 0
    files_skipped_existing = 0
    files_processed = 0
    rows_processed = 0
    rows_written = 0
    trade_date_ranges = [
        (item.min_trade_date.isoformat(), item.max_trade_date.isoformat())
        for item in legacy_files
    ]
    first_file = legacy_files[0].source_path.name if legacy_files else None
    last_file = legacy_files[-1].source_path.name if legacy_files else None

    try:
        for legacy_file in legacy_files:
            parse_path = legacy_file.source_path
            if not dry_run:
                copied = _copy_legacy_file(
                    source_path=legacy_file.source_path,
                    local_path=legacy_file.local_path,
                )
                files_copied += 1 if copied else 0
                files_skipped_existing += 0 if copied else 1
                parse_path = legacy_file.local_path
                _upsert_manifest_record(
                    legacy_file=legacy_file,
                    database=database,
                    schema=schema,
                    manifest_table=manifest_table,
                )

            frame = upsert_ice_trade_blotters.parse_trade_blotter_file(parse_path)
            files_processed += 1
            rows_processed += int(len(frame))
            if not dry_run and not frame.empty:
                summary = upsert_ice_trade_blotters.run_import(
                    csv_filepath=parse_path,
                    schema=schema,
                    table_name=table_name,
                    manifest_table=manifest_table,
                    formatted_files_dir=resolved_formatted_dir,
                    database=database,
                )
                rows_written += int(summary["rows_processed"])

        return IceTradeBlotterBackfillResult(
            pipeline_name=API_SCRAPE_NAME,
            operation_name=OPERATION_NAME,
            source_dir=str(resolved_source_dir),
            formatted_files_dir=str(resolved_formatted_dir),
            files_discovered=len(legacy_files),
            files_copied=files_copied,
            files_skipped_existing=files_skipped_existing,
            files_processed=files_processed,
            rows_processed=rows_processed,
            rows_written=rows_written,
            status="dry_run" if dry_run else status,
            dry_run=dry_run,
            min_trade_date=min(item[0] for item in trade_date_ranges)
            if trade_date_ranges
            else None,
            max_trade_date=max(item[1] for item in trade_date_ranges)
            if trade_date_ranges
            else None,
            first_file=first_file,
            last_file=last_file,
        )
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
                files_discovered=len(legacy_files),
                files_copied=files_copied,
                files_skipped_existing=files_skipped_existing,
                files_processed=files_processed,
                source_dir=resolved_source_dir,
                formatted_files_dir=resolved_formatted_dir,
                start_trade_date=start.isoformat() if start else None,
                end_trade_date=end.isoformat() if end else None,
                max_files=max_files,
                batch_size=batch_size,
                first_file=first_file,
                last_file=last_file,
                error_type=error_type,
                error_message=error_message,
                database=database,
            )


def _normalize_trade_date(value: str | date | datetime | pd.Timestamp) -> date:
    parsed = pd.Timestamp(value)
    if pd.isna(parsed):
        raise ValueError(f"Invalid trade date: {value!r}")
    return parsed.date()


def _matching_legacy_files(
    *,
    source_dir: Path,
    formatted_files_dir: Path,
    start_trade_date: date | None,
    end_trade_date: date | None,
) -> list[IceTradeBlotterLegacyCacheFile]:
    if not source_dir.exists():
        raise FileNotFoundError(f"ICE trade blotter legacy source directory not found: {source_dir}")

    matched: list[tuple[date, date, str, IceTradeBlotterLegacyCacheFile]] = []
    for source_path in sorted(source_dir.glob(manage_csv_files.TRADE_FILE_PATTERN)):
        metadata = manage_csv_files.inspect_trade_file(source_path)
        min_trade_date = metadata["min_trade_date"]
        max_trade_date = metadata["max_trade_date"]
        if not isinstance(min_trade_date, date) or not isinstance(max_trade_date, date):
            raise ValueError(f"Unexpected trade-date metadata for {source_path.name}")
        if start_trade_date is not None and max_trade_date < start_trade_date:
            continue
        if end_trade_date is not None and min_trade_date > end_trade_date:
            continue

        local_path = manage_csv_files._formatted_path(
            metadata=metadata,
            formatted_files_dir=formatted_files_dir,
        )
        matched.append(
            (
                min_trade_date,
                max_trade_date,
                source_path.name,
                IceTradeBlotterLegacyCacheFile(
                    source_path=source_path,
                    local_path=local_path,
                    file_hash=str(metadata["file_hash"]),
                    min_trade_date=min_trade_date,
                    max_trade_date=max_trade_date,
                    row_count=int(metadata["row_count"]),
                ),
            )
        )

    return [legacy_file for *_keys, legacy_file in sorted(matched)]


def _copy_legacy_file(*, source_path: Path, local_path: Path) -> bool:
    local_path.parent.mkdir(parents=True, exist_ok=True)
    if local_path.exists():
        if upsert_ice_trade_blotters.file_hash(local_path) != upsert_ice_trade_blotters.file_hash(source_path):
            raise FileExistsError(
                "Destination ICE trade blotter already exists with different contents: "
                f"{local_path}"
            )
        return False

    temp_path = local_path.with_name(f"{local_path.name}.copy")
    if temp_path.exists():
        temp_path.unlink()
    shutil.copy2(source_path, temp_path)
    temp_path.replace(local_path)
    return True


def _upsert_manifest_record(
    *,
    legacy_file: IceTradeBlotterLegacyCacheFile,
    database: str | None,
    schema: str,
    manifest_table: str,
) -> None:
    existing_record = manage_csv_files._existing_manifest_record(
        file_hash=legacy_file.file_hash,
        schema=schema,
        table_name=manifest_table,
        database=database,
    )
    record = {
        "file_hash": legacy_file.file_hash,
        "source_filename": legacy_file.source_path.name,
        "stored_filename": legacy_file.local_path.name,
        "min_trade_date": legacy_file.min_trade_date,
        "max_trade_date": legacy_file.max_trade_date,
        "row_count": legacy_file.row_count,
        "source_file_modified_at": datetime.fromtimestamp(
            legacy_file.source_path.stat().st_mtime,
            tz=timezone.utc,
        ),
        "managed_at": datetime.now(timezone.utc),
        "status": "managed",
        "is_loaded": bool(existing_record.get("is_loaded")) if existing_record else False,
        "loaded_at": existing_record.get("loaded_at") if existing_record else None,
        "loaded_row_count": (
            existing_record.get("loaded_row_count") if existing_record else None
        ),
    }
    manage_csv_files._upsert_manifest(
        records=[record],
        schema=schema,
        table_name=manifest_table,
        database=database,
    )


def _log_backfill_attempt(
    *,
    status: str,
    elapsed_ms: int,
    rows_processed: int,
    rows_written: int,
    files_discovered: int,
    files_copied: int,
    files_skipped_existing: int,
    files_processed: int,
    source_dir: Path,
    formatted_files_dir: Path,
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
        target_table=settings.TRADE_BLOTTERS_TARGET_TABLE,
        method="LOCAL_FILE",
        target_host="local-cache",
        target_path=str(source_dir),
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
            "legacy_source_dir": str(source_dir),
            "formatted_files_dir": str(formatted_files_dir),
            "files_discovered": files_discovered,
            "files_copied": files_copied,
            "files_skipped_existing": files_skipped_existing,
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
