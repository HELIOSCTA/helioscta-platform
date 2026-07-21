"""Manage manually downloaded ICE trade blotter .xls files."""
from __future__ import annotations

import logging
import re
import shutil
from datetime import date, datetime, timezone
from pathlib import Path

import pandas as pd

from backend.scrapes.ice_trade_blotters import settings
from backend.scrapes.ice_trade_blotters.scripts import upsert_ice_trade_blotters
from backend.utils import db, script_logging


API_SCRAPE_NAME = settings.CSV_MANAGER_OPERATION_NAME
SOURCE_SYSTEM = settings.SOURCE_SYSTEM

DEFAULT_INBOX_DIR = settings.CSV_INBOX_DIR
DEFAULT_FORMATTED_FILES_DIR = settings.CSV_FORMATTED_FILES_DIR
DEFAULT_SCHEMA = settings.TRADE_BLOTTERS_SCHEMA
DEFAULT_MANIFEST_TABLE = settings.FILE_MANIFEST_TABLE

TRADE_FILE_PATTERN = "*.xls"
TRADE_FILE_LABEL = "XLS"

MANIFEST_COLUMNS: list[str] = [
    "file_hash",
    "source_filename",
    "stored_filename",
    "min_trade_date",
    "max_trade_date",
    "row_count",
    "source_file_modified_at",
    "managed_at",
    "status",
    "is_loaded",
    "loaded_at",
    "loaded_row_count",
]

MANIFEST_DATA_TYPES: list[str] = [
    "VARCHAR",
    "VARCHAR",
    "VARCHAR",
    "DATE",
    "DATE",
    "INTEGER",
    "TIMESTAMPTZ",
    "TIMESTAMPTZ",
    "VARCHAR",
    "BOOLEAN",
    "TIMESTAMPTZ",
    "INTEGER",
]

MANIFEST_PRIMARY_KEY: list[str] = ["file_hash"]

logger = logging.getLogger(__name__)


def _date_range_filename(metadata: dict[str, object]) -> str:
    min_trade_date = pd.Timestamp(metadata["min_trade_date"]).strftime("%Y_%m_%d")
    max_trade_date = pd.Timestamp(metadata["max_trade_date"]).strftime("%Y_%m_%d")
    file_hash = str(metadata["file_hash"])
    return f"deal_report_{min_trade_date}_to_{max_trade_date}__{file_hash[:12]}.xls"


def _file_hash(filepath: Path) -> str:
    return upsert_ice_trade_blotters.file_hash(filepath)


def _inbox_trade_files(inbox_dir: Path) -> list[Path]:
    return sorted(Path(inbox_dir).glob(TRADE_FILE_PATTERN))


def _parse_trade_date_range_from_df(df: pd.DataFrame, filepath: Path) -> tuple[int, date, date]:
    if df.empty or "trade_date" not in df.columns:
        raise ValueError(f"No trade rows found in {filepath}")

    parsed_trade_dates = pd.to_datetime(df["trade_date"], errors="coerce")
    if parsed_trade_dates.isna().any():
        raise ValueError(f"Could not parse one or more trade dates in {filepath.name}")

    trade_dates = [value.date() for value in parsed_trade_dates]
    if not trade_dates:
        raise ValueError(f"No trade rows found in {filepath}")

    return len(trade_dates), min(trade_dates), max(trade_dates)


def _parse_trade_date_range(filepath: Path) -> tuple[int, date, date]:
    raw_df = upsert_ice_trade_blotters._read_file(filepath=filepath)
    return _parse_trade_date_range_from_df(df=raw_df, filepath=filepath)


def inspect_trade_file(filepath: str | Path) -> dict[str, object]:
    filepath = Path(filepath)
    raw_df = upsert_ice_trade_blotters._read_file(filepath=filepath)
    _assert_no_lossy_trade_identifiers(filepath=filepath, raw_df=raw_df)
    row_count, min_trade_date, max_trade_date = _parse_trade_date_range_from_df(
        df=raw_df,
        filepath=filepath,
    )
    return {
        "file_hash": _file_hash(filepath),
        "source_filename": filepath.name,
        "min_trade_date": min_trade_date,
        "max_trade_date": max_trade_date,
        "row_count": row_count,
        "source_file_modified_at": datetime.fromtimestamp(
            filepath.stat().st_mtime,
            tz=timezone.utc,
        ),
    }


def inspect_csv(filepath: str | Path) -> dict[str, object]:
    return inspect_trade_file(filepath=filepath)


def _assert_no_lossy_trade_identifiers(
    filepath: Path,
    raw_df: pd.DataFrame | None = None,
) -> None:
    if raw_df is None:
        raw_df = upsert_ice_trade_blotters._read_file(filepath=filepath)
    if upsert_ice_trade_blotters.has_lossy_trade_identifiers(raw_df):
        raise ValueError(
            f"{Path(filepath).name} contains lossy scientific-notation trade "
            "identifiers. Re-export the file with Deal ID, Leg ID, Orig ID, "
            "and Link ID preserved as text before managing it."
        )


def _formatted_path(
    metadata: dict[str, object],
    formatted_files_dir: str | Path = DEFAULT_FORMATTED_FILES_DIR,
) -> Path:
    return Path(formatted_files_dir) / _date_range_filename(metadata)


def _existing_manifest_record(
    file_hash: str,
    schema: str = DEFAULT_SCHEMA,
    table_name: str = DEFAULT_MANIFEST_TABLE,
    database: str | None = settings.TARGET_DATABASE,
) -> dict[str, object] | None:
    _validate_identifier(schema)
    _validate_identifier(table_name)
    if not _table_exists(schema=schema, table_name=table_name, database=database):
        raise RuntimeError(
            f"Required manifest table missing: {schema}.{table_name}. "
            "Apply the ICE trade blotter operator DDL before managing files."
        )

    rows = db.execute_sql(
        f"""
        SELECT
            source_filename,
            stored_filename,
            status,
            is_loaded,
            loaded_at,
            loaded_row_count
        FROM {schema}.{table_name}
        WHERE file_hash = %s
        LIMIT 1;
        """,
        params=(file_hash,),
        fetch=True,
        database=database,
    )
    return rows[0] if rows else None


def _table_exists(
    schema: str,
    table_name: str,
    database: str | None = settings.TARGET_DATABASE,
) -> bool:
    rows = db.execute_sql(
        "SELECT to_regclass(%s) AS table_name;",
        params=(f"{schema}.{table_name}",),
        fetch=True,
        database=database,
    )
    return bool(rows and rows[0]["table_name"])


def _validate_identifier(identifier: str) -> None:
    if not re.fullmatch(r"[a-zA-Z_][a-zA-Z0-9_]*", identifier):
        raise ValueError(f"Invalid SQL identifier: {identifier}")


def _manifest_dataframe(records: list[dict[str, object]]) -> pd.DataFrame:
    frame = pd.DataFrame(records)
    if frame.empty:
        return pd.DataFrame(columns=MANIFEST_COLUMNS)

    for column in MANIFEST_COLUMNS:
        if column not in frame.columns:
            frame[column] = None
    return frame[MANIFEST_COLUMNS]


def _upsert_manifest(
    records: list[dict[str, object]],
    schema: str = DEFAULT_SCHEMA,
    table_name: str = DEFAULT_MANIFEST_TABLE,
    database: str | None = settings.TARGET_DATABASE,
) -> None:
    if not records:
        return

    _validate_identifier(schema)
    _validate_identifier(table_name)
    if not _table_exists(schema=schema, table_name=table_name, database=database):
        raise RuntimeError(
            f"Required manifest table missing: {schema}.{table_name}. "
            "Apply the ICE trade blotter operator DDL before managing files."
        )

    db.upsert_dataframe(
        schema=schema,
        table_name=table_name,
        df=_manifest_dataframe(records),
        columns=MANIFEST_COLUMNS,
        primary_key=MANIFEST_PRIMARY_KEY,
        data_types=MANIFEST_DATA_TYPES,
        database=database,
    )


def _managed_record(
    *,
    metadata: dict[str, object],
    stored_filename: str,
    existing_record: dict[str, object] | None,
    status: str = "managed",
) -> dict[str, object]:
    source_filename = (
        existing_record.get("source_filename")
        if existing_record and existing_record.get("source_filename")
        else metadata["source_filename"]
    )
    return {
        **metadata,
        "source_filename": source_filename,
        "stored_filename": stored_filename,
        "managed_at": datetime.now(timezone.utc),
        "status": status,
        "is_loaded": bool(existing_record.get("is_loaded")) if existing_record else False,
        "loaded_at": existing_record.get("loaded_at") if existing_record else None,
        "loaded_row_count": (
            existing_record.get("loaded_row_count") if existing_record else None
        ),
    }


def standardize_formatted_files(
    formatted_files_dir: str | Path = DEFAULT_FORMATTED_FILES_DIR,
    schema: str = DEFAULT_SCHEMA,
    manifest_table: str = DEFAULT_MANIFEST_TABLE,
    database: str | None = settings.TARGET_DATABASE,
) -> dict[str, object]:
    formatted_files_dir = Path(formatted_files_dir)
    formatted_files_dir.mkdir(parents=True, exist_ok=True)

    records: list[dict[str, object]] = []
    managed_files: list[str] = []
    renamed_files = 0
    skipped_files = 0

    for filepath in sorted(formatted_files_dir.glob(TRADE_FILE_PATTERN)):
        metadata = inspect_trade_file(filepath)
        desired_path = _formatted_path(
            metadata=metadata,
            formatted_files_dir=formatted_files_dir,
        )
        existing_record = _existing_manifest_record(
            file_hash=str(metadata["file_hash"]),
            schema=schema,
            table_name=manifest_table,
            database=database,
        )
        manifest_needs_update = not existing_record or (
            str(existing_record["stored_filename"]) != desired_path.name
        )

        if filepath != desired_path:
            if desired_path.exists():
                if _file_hash(desired_path) != str(metadata["file_hash"]):
                    raise FileExistsError(
                        f"Cannot rename {filepath} to {desired_path}; destination "
                        "exists with different contents."
                    )
                filepath.unlink()
                skipped_files += 1
                logger.info("Removed duplicate formatted file %s", filepath.name)
            else:
                filepath.rename(desired_path)
                renamed_files += 1
                logger.info("Renamed formatted file %s to %s", filepath.name, desired_path.name)
            filepath = desired_path
            manifest_needs_update = True

        if manifest_needs_update:
            record = _managed_record(
                metadata=metadata,
                stored_filename=desired_path.name,
                existing_record=existing_record,
            )
            records.append(record)
            managed_files.append(str(desired_path))

    _upsert_manifest(
        records=records,
        schema=schema,
        table_name=manifest_table,
        database=database,
    )

    return {
        "files_standardized": renamed_files,
        "duplicate_files_removed": skipped_files,
        "manifest_records_updated": len(records),
        "rows_processed": sum(int(record["row_count"]) for record in records),
        "managed_files": managed_files,
    }


def manage_csv_files(
    inbox_dir: str | Path = DEFAULT_INBOX_DIR,
    formatted_files_dir: str | Path = DEFAULT_FORMATTED_FILES_DIR,
    schema: str = DEFAULT_SCHEMA,
    manifest_table: str = DEFAULT_MANIFEST_TABLE,
    move_files: bool = True,
    standardize_existing: bool = True,
    database: str | None = settings.TARGET_DATABASE,
) -> dict[str, object]:
    inbox_dir = Path(inbox_dir)
    formatted_files_dir = Path(formatted_files_dir)
    inbox_dir.mkdir(parents=True, exist_ok=True)
    formatted_files_dir.mkdir(parents=True, exist_ok=True)

    records: list[dict[str, object]] = []
    managed_files: list[str] = []
    trade_files = _inbox_trade_files(inbox_dir)
    logger.info("Found %s %s file(s) in %s", len(trade_files), TRADE_FILE_LABEL, inbox_dir)

    for filepath in trade_files:
        logger.info("Managing %s", filepath.name)
        metadata = inspect_trade_file(filepath)
        existing_record = _existing_manifest_record(
            file_hash=str(metadata["file_hash"]),
            schema=schema,
            table_name=manifest_table,
            database=database,
        )
        destination = _formatted_path(
            metadata=metadata,
            formatted_files_dir=formatted_files_dir,
        )
        existing_destination = (
            formatted_files_dir / str(existing_record["stored_filename"])
            if existing_record and existing_record.get("stored_filename")
            else None
        )
        destination.parent.mkdir(parents=True, exist_ok=True)

        if move_files:
            if existing_record and (
                destination.exists()
                or (existing_destination is not None and existing_destination.exists())
            ):
                filepath.unlink()
                logger.info(
                    "Removed duplicate inbox file; manifest already has %s",
                    existing_record["stored_filename"],
                )
            elif destination.exists():
                filepath.unlink()
                logger.info(
                    "Removed duplicate inbox file; formatted file already has %s",
                    destination.name,
                )
            else:
                shutil.move(str(filepath), str(destination))
                logger.info("Promoted %s to %s", filepath.name, destination)
        else:
            logger.info("Dry run: would promote %s to %s", filepath.name, destination)

        stored_filename = destination.name
        if (
            existing_record
            and existing_record.get("stored_filename")
            and existing_destination is not None
            and existing_destination.exists()
        ):
            stored_filename = str(existing_record["stored_filename"])
        record = _managed_record(
            metadata=metadata,
            stored_filename=stored_filename,
            existing_record=existing_record,
            status="managed" if move_files else "dry_run",
        )
        records.append(record)
        if move_files:
            managed_files.append(str(formatted_files_dir / stored_filename))

    _upsert_manifest(
        records=records,
        schema=schema,
        table_name=manifest_table,
        database=database,
    )

    standardize_summary = {
        "files_standardized": 0,
        "duplicate_files_removed": 0,
        "manifest_records_updated": 0,
        "rows_processed": 0,
        "managed_files": [],
    }
    if standardize_existing:
        standardize_summary = standardize_formatted_files(
            formatted_files_dir=formatted_files_dir,
            schema=schema,
            manifest_table=manifest_table,
            database=database,
        )
        managed_files.extend(str(path) for path in standardize_summary["managed_files"])

    return {
        "files_processed": len(records),
        "files_standardized": int(standardize_summary["files_standardized"]),
        "duplicate_files_removed": int(standardize_summary["duplicate_files_removed"]),
        "manifest_records_updated": (
            len(records) + int(standardize_summary["manifest_records_updated"])
        ),
        "rows_processed": (
            sum(int(record["row_count"]) for record in records)
            + int(standardize_summary["rows_processed"])
        ),
        "manifest_table": f"{schema}.{manifest_table}",
        "managed_files": sorted(dict.fromkeys(managed_files)),
    }


def main(
    inbox_dir: str | Path = DEFAULT_INBOX_DIR,
    formatted_files_dir: str | Path = DEFAULT_FORMATTED_FILES_DIR,
    schema: str = DEFAULT_SCHEMA,
    manifest_table: str = DEFAULT_MANIFEST_TABLE,
    move_files: bool = True,
    standardize_existing: bool = True,
    database: str | None = settings.TARGET_DATABASE,
) -> int:
    run_logger = script_logging.init_logging(
        name=API_SCRAPE_NAME,
        log_dir=script_logging.get_log_dir(settings.CSV_MANAGER_LOG_DIR),
        log_to_file=True,
        delete_if_no_errors=True,
    )
    try:
        run_logger.header(API_SCRAPE_NAME)
        summary = manage_csv_files(
            inbox_dir=inbox_dir,
            formatted_files_dir=formatted_files_dir,
            schema=schema,
            manifest_table=manifest_table,
            move_files=move_files,
            standardize_existing=standardize_existing,
            database=database,
        )
        run_logger.success(
            f"Managed {summary['files_processed']:,} inbox {TRADE_FILE_LABEL} file(s); "
            f"standardized {summary['files_standardized']:,} formatted file(s)."
        )
        return 0
    except Exception as exc:
        run_logger.exception(f"ICE trade blotter file manager failed: {exc}")
        raise
    finally:
        script_logging.close_logging()


if __name__ == "__main__":
    raise SystemExit(main())
