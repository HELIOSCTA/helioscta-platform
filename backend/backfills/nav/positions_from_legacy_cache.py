"""Manual backfill runner for legacy cached NAV position workbooks."""

from __future__ import annotations

import shutil
import time
from dataclasses import dataclass
from datetime import date, datetime
from pathlib import Path

import pandas as pd

from backend import credentials
from backend.scrapes.nav import positions as source
from backend.utils.ops_logging import log_api_fetch, redact_secrets

API_SCRAPE_NAME = source.API_SCRAPE_NAME
OPERATION_NAME = f"{API_SCRAPE_NAME}_legacy_cache_backfill"
PROVIDER = source.SOURCE_SYSTEM
DEFAULT_LEGACY_SOURCE_DIR = Path(
    r"C:\Users\AidanKeaveny\Documents\github\helioscta-backend"
    r"\backend\src\postions_and_trades\sftp_files\positions\nav_positions"
)
DEFAULT_LOCAL_DIR = source.DEFAULT_LOCAL_ROOT
DEFAULT_BATCH_SIZE = 10


@dataclass(frozen=True)
class NavLegacyCacheFile:
    fund_config: source.NavPositionFundConfig
    source_path: Path
    local_path: Path
    nav_date: date
    sftp_upload_timestamp: pd.Timestamp


@dataclass(frozen=True)
class NavLegacyCacheBackfillResult:
    pipeline_name: str
    operation_name: str
    source_dir: str
    local_dir: str
    files_discovered: int
    files_copied: int
    files_skipped_existing: int
    files_processed: int
    rows_processed: int
    rows_written: int
    status: str
    dry_run: bool = False
    min_nav_date: str | None = None
    max_nav_date: str | None = None
    first_file: str | None = None
    last_file: str | None = None


def main(
    source_dir: str | Path = DEFAULT_LEGACY_SOURCE_DIR,
    local_dir: str | Path | None = DEFAULT_LOCAL_DIR,
    fund_codes: tuple[str, ...] | list[str] | None = None,
    start_nav_date: str | date | datetime | pd.Timestamp | None = None,
    end_nav_date: str | date | datetime | pd.Timestamp | None = None,
    batch_size: int = DEFAULT_BATCH_SIZE,
    max_files: int | None = None,
    dry_run: bool = False,
    database: str | None = None,
) -> NavLegacyCacheBackfillResult:
    """Copy legacy NAV workbooks into the local cache and upsert parsed rows."""
    if batch_size < 1:
        raise ValueError("batch_size must be at least 1.")
    if max_files is not None and max_files < 1:
        raise ValueError("max_files must be at least 1 when provided.")

    database = database or credentials.AZURE_POSTGRESQL_DB_NAME
    resolved_source_dir = Path(source_dir)
    resolved_local_dir = source.resolve_local_root(local_dir)
    selected_configs = source.resolve_fund_configs(fund_codes)
    start = (
        source.normalize_nav_date(start_nav_date)
        if start_nav_date is not None
        else None
    )
    end = (
        source.normalize_nav_date(end_nav_date)
        if end_nav_date is not None
        else None
    )
    if start is not None and end is not None and start > end:
        raise ValueError("start_nav_date must be on or before end_nav_date.")

    legacy_files = _matching_legacy_files(
        source_dir=resolved_source_dir,
        local_dir=resolved_local_dir,
        fund_configs=selected_configs,
        start_nav_date=start,
        end_nav_date=end,
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
    nav_dates = [legacy_file.nav_date.isoformat() for legacy_file in legacy_files]
    first_file = legacy_files[0].source_path.name if legacy_files else None
    last_file = legacy_files[-1].source_path.name if legacy_files else None

    try:
        batch_frames: list[pd.DataFrame] = []
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

            frame = source.parse_position_file(
                parse_path,
                fund_config=legacy_file.fund_config,
            )
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

        return NavLegacyCacheBackfillResult(
            pipeline_name=API_SCRAPE_NAME,
            operation_name=OPERATION_NAME,
            source_dir=str(resolved_source_dir),
            local_dir=str(resolved_local_dir),
            files_discovered=len(legacy_files),
            files_copied=files_copied,
            files_skipped_existing=files_skipped_existing,
            files_processed=files_processed,
            rows_processed=rows_processed,
            rows_written=rows_written,
            status="dry_run" if dry_run else status,
            dry_run=dry_run,
            min_nav_date=min(nav_dates) if nav_dates else None,
            max_nav_date=max(nav_dates) if nav_dates else None,
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
                local_dir=resolved_local_dir,
                fund_codes=[config.fund_code for config in selected_configs],
                start_nav_date=start.isoformat() if start else None,
                end_nav_date=end.isoformat() if end else None,
                max_files=max_files,
                batch_size=batch_size,
                first_file=first_file,
                last_file=last_file,
                error_type=error_type,
                error_message=error_message,
                database=database,
            )


def _matching_legacy_files(
    *,
    source_dir: Path,
    local_dir: Path,
    fund_configs: list[source.NavPositionFundConfig],
    start_nav_date: date | None,
    end_nav_date: date | None,
) -> list[NavLegacyCacheFile]:
    if not source_dir.exists():
        raise FileNotFoundError(f"NAV legacy source directory not found: {source_dir}")

    matched: list[tuple[date, pd.Timestamp, str, NavLegacyCacheFile]] = []
    for config in fund_configs:
        fund_source_dir = source_dir / config.local_subdir
        if not fund_source_dir.exists():
            raise FileNotFoundError(
                f"NAV legacy fund directory not found: {fund_source_dir}"
            )
        for source_path in fund_source_dir.iterdir():
            if not source_path.is_file() or source_path.suffix.lower() != ".xlsx":
                continue
            parsed = source.parse_position_filename(
                source_path.name,
                expected_config=config,
            )
            nav_date = parsed["nav_date"]
            if not isinstance(nav_date, date):
                raise ValueError(f"Unexpected NAV date parsed from {source_path.name}")
            if start_nav_date is not None and nav_date < start_nav_date:
                continue
            if end_nav_date is not None and nav_date > end_nav_date:
                continue
            upload_timestamp = pd.Timestamp(parsed["sftp_upload_timestamp"])
            legacy_file = NavLegacyCacheFile(
                fund_config=config,
                source_path=source_path,
                local_path=local_dir / config.local_subdir / source_path.name,
                nav_date=nav_date,
                sftp_upload_timestamp=upload_timestamp,
            )
            matched.append(
                (
                    nav_date,
                    upload_timestamp,
                    config.fund_code,
                    legacy_file,
                )
            )

    return [legacy_file for *_keys, legacy_file in sorted(matched)]


def _copy_legacy_file(*, source_path: Path, local_path: Path) -> bool:
    local_path.parent.mkdir(parents=True, exist_ok=True)
    if local_path.exists():
        if local_path.stat().st_size != source_path.stat().st_size:
            raise FileExistsError(
                "Destination NAV workbook already exists with a different size: "
                f"{local_path}"
            )
        return False

    temp_path = local_path.with_name(f"{local_path.name}.copy")
    if temp_path.exists():
        temp_path.unlink()
    shutil.copy2(source_path, temp_path)
    temp_path.replace(local_path)
    return True


def _upsert_batch(*, frames: list[pd.DataFrame], database: str | None) -> int:
    df = pd.concat(frames, ignore_index=True)
    if df.empty:
        return 0
    source._upsert_positions(df=df, database=database)
    return int(len(df))


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
    local_dir: Path,
    fund_codes: list[str],
    start_nav_date: str | None,
    end_nav_date: str | None,
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
            "local_cache_dir": str(local_dir),
            "fund_codes": fund_codes,
            "files_discovered": files_discovered,
            "files_copied": files_copied,
            "files_skipped_existing": files_skipped_existing,
            "files_processed": files_processed,
            "start_nav_date": start_nav_date,
            "end_nav_date": end_nav_date,
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
