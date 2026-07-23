"""PJM eDART transmission outage raw TXT file scrape.

Source system: PJM eDART Transmission Facilities Outage List.
Endpoint: https://edart.pjm.com/reports/linesout.txt, served as a ZIP.
Target table: pjm.transmission_outages_raw.
Grain: one raw TXT file per source_file_sha256.
Freshness: source_report_timestamp from the TXT TIMESTAMP header.
Retention: source TXT files older than DEFAULT_RETENTION_DAYS by ingested_at
are purged after a successful upsert.

The storage contract is intentionally file-level only. The database stores the
raw TXT content and minimal fetch metadata; ticket/equipment parsing belongs in
read-time application code or downstream derived artifacts, not this table.
"""

from __future__ import annotations

import hashlib
import io
import json
import logging
import re
import time
import zipfile
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any
from urllib.parse import urlsplit
from uuid import uuid4

import pandas as pd
import requests
from psycopg2 import sql
from psycopg2.extras import execute_values

from backend import credentials
from backend.utils import db, retention, script_logging
from backend.utils.ops_logging import log_api_fetch


logger = logging.getLogger(__name__)

API_SCRAPE_NAME = "transmission_outages"
TARGET_SCHEMA = "pjm"
TARGET_TABLE = "transmission_outages_raw"
TARGET_TABLE_FQN = f"{TARGET_SCHEMA}.{TARGET_TABLE}"
LINESOUT_URL = "https://edart.pjm.com/reports/linesout.txt"
SOURCE_REPORT_TIMEZONE = "America/New_York"
DEFAULT_RETENTION_DAYS = 7
DEFAULT_TIMEOUT_SECONDS = 120

TIMESTAMP_RE = re.compile(r"TIMESTAMP:(\d{2}-\d{2}-\d{4}\s+\d{2}:\d{2}:\d{2})")
THROTTLE_RE = re.compile(
    r"linesout\.txt file requested by this IP Address has not been updated",
    re.IGNORECASE,
)

RAW_COLUMNS = [
    "source_report_timestamp",
    "source_report_timezone",
    "source_file_sha256",
    "source_url",
    "source_content_type",
    "source_content_length",
    "source_line_count",
    "raw_text",
    "ingested_at",
]
PRIMARY_KEY_COLUMNS = {"source_file_sha256"}


@dataclass(frozen=True)
class PullResult:
    text: str
    http_status: int
    elapsed_ms: int
    content_type: str
    content_length: int
    source_file_sha256: str
    throttled: bool


@dataclass(frozen=True)
class ValidationResult:
    source_file_sha256: str
    source_files: int
    table_files: int
    raw_text_matches: bool
    timestamp_matches: bool
    line_count_matches: bool

    @property
    def ok(self) -> bool:
        return (
            self.source_files == self.table_files
            and self.raw_text_matches
            and self.timestamp_matches
            and self.line_count_matches
        )


def pull_linesout_text(
    *,
    url: str = LINESOUT_URL,
    timeout: int = DEFAULT_TIMEOUT_SECONDS,
    run_id: str | None = None,
    database: str | None = None,
    metadata: dict[str, Any] | None = None,
) -> PullResult:
    """Download and extract the current PJM eDART linesout.txt file."""
    parsed_url = urlsplit(url)
    started_at = time.perf_counter()
    response: requests.Response | None = None

    try:
        response = requests.get(url, timeout=timeout)
        elapsed_ms = round((time.perf_counter() - started_at) * 1000)
        response.raise_for_status()
        text = _extract_text(response.content)
        return PullResult(
            text=text,
            http_status=response.status_code,
            elapsed_ms=elapsed_ms,
            content_type=response.headers.get("Content-Type", ""),
            content_length=len(response.content),
            source_file_sha256=_sha256_text(text),
            throttled=_is_throttle_response(text),
        )

    except requests.RequestException as exc:
        elapsed_ms = round((time.perf_counter() - started_at) * 1000)
        log_api_fetch(
            actor_type="scrape",
            provider="pjm_edart",
            pipeline_name=API_SCRAPE_NAME,
            run_id=run_id,
            operation_name="linesout_txt",
            feed_name="linesout.txt",
            target_table=TARGET_TABLE_FQN,
            method="GET",
            target_host=parsed_url.netloc,
            target_path=parsed_url.path,
            status="failure",
            http_status=response.status_code if response is not None else None,
            elapsed_ms=elapsed_ms,
            error_type=type(exc).__name__,
            error_message=str(exc),
            metadata=metadata,
            database=database,
        )
        raise


def parse_linesout_text(
    text: str,
    *,
    ingested_at: pd.Timestamp | None = None,
    source_url: str = LINESOUT_URL,
    source_content_type: str | None = None,
    source_content_length: int | None = None,
) -> pd.DataFrame:
    """Build one raw source-file row from linesout.txt content."""
    if _is_throttle_response(text):
        return pd.DataFrame(columns=RAW_COLUMNS)

    source_report_timestamp = _parse_report_timestamp(text)
    ingested_at = ingested_at or pd.Timestamp.now(tz="UTC")
    row = {
        "source_report_timestamp": source_report_timestamp,
        "source_report_timezone": SOURCE_REPORT_TIMEZONE,
        "source_file_sha256": _sha256_text(text),
        "source_url": source_url,
        "source_content_type": source_content_type or "",
        "source_content_length": (
            source_content_length if source_content_length is not None else len(text)
        ),
        "source_line_count": _line_count(text),
        "raw_text": text,
        "ingested_at": ingested_at,
    }
    return pd.DataFrame([row], columns=RAW_COLUMNS)


def upsert_transmission_outages_raw(
    df: pd.DataFrame,
    *,
    database: str | None = None,
) -> int:
    """Upsert raw TXT source-file rows into pjm.transmission_outages_raw."""
    if df.empty:
        return 0

    _validate_frame_columns(df)
    connection = None
    cursor = None
    try:
        connection = db.connect(database=database)
        cursor = connection.cursor()
        cursor.execute(
            sql.SQL("SELECT 1 FROM {}.{} LIMIT 0").format(
                sql.Identifier(TARGET_SCHEMA),
                sql.Identifier(TARGET_TABLE),
            )
        )

        rows = [
            tuple(_db_value(value) for value in row)
            for row in df[RAW_COLUMNS].itertuples(index=False, name=None)
        ]

        query = sql.SQL(
            """
            INSERT INTO {}.{} ({})
            VALUES %s
            ON CONFLICT (source_file_sha256)
            DO UPDATE SET {};
            """
        ).format(
            sql.Identifier(TARGET_SCHEMA),
            sql.Identifier(TARGET_TABLE),
            sql.SQL(", ").join(sql.Identifier(column) for column in RAW_COLUMNS),
            sql.SQL(", ").join(
                [
                    sql.SQL("{} = EXCLUDED.{}").format(
                        sql.Identifier(column),
                        sql.Identifier(column),
                    )
                    for column in RAW_COLUMNS
                    if column not in PRIMARY_KEY_COLUMNS
                ]
                + [sql.SQL("updated_at = now()")]
            ),
        )
        execute_values(cursor, query.as_string(connection), rows, page_size=1000)
        connection.commit()
        return len(df)

    except Exception:
        if connection:
            connection.rollback()
        raise
    finally:
        if cursor:
            cursor.close()
        if connection:
            connection.close()


def purge_retention(
    *,
    retention_days: int = DEFAULT_RETENTION_DAYS,
    database: str | None = None,
) -> int:
    """Purge raw TXT files outside the configured hot retention window."""
    return retention.purge_rows_older_than(
        schema=TARGET_SCHEMA,
        table_name=TARGET_TABLE,
        timestamp_column="ingested_at",
        retention_days=retention_days,
        database=database,
    )


def validate_table_against_text(
    text: str,
    *,
    database: str | None = None,
) -> ValidationResult:
    """Validate that the raw TXT file is stored unchanged."""
    expected_df = parse_linesout_text(text)
    source_file_sha256 = _sha256_text(text)
    if expected_df.empty:
        return ValidationResult(
            source_file_sha256=source_file_sha256,
            source_files=0,
            table_files=0,
            raw_text_matches=True,
            timestamp_matches=True,
            line_count_matches=True,
        )

    expected = expected_df.iloc[0].to_dict()
    table_rows = db.execute_sql(
        """
        SELECT
            source_report_timestamp,
            source_report_timezone,
            source_file_sha256,
            source_url,
            source_content_type,
            source_content_length,
            source_line_count,
            raw_text
        FROM pjm.transmission_outages_raw
        WHERE source_file_sha256 = %s;
        """,
        params=(source_file_sha256,),
        database=database,
        fetch=True,
    )
    table_files = len(table_rows or [])
    if table_files != 1:
        return ValidationResult(
            source_file_sha256=source_file_sha256,
            source_files=1,
            table_files=table_files,
            raw_text_matches=False,
            timestamp_matches=False,
            line_count_matches=False,
        )

    actual = table_rows[0]
    return ValidationResult(
        source_file_sha256=source_file_sha256,
        source_files=1,
        table_files=1,
        raw_text_matches=actual["raw_text"] == text,
        timestamp_matches=_canonical_value(actual["source_report_timestamp"])
        == _canonical_value(expected["source_report_timestamp"]),
        line_count_matches=int(actual["source_line_count"])
        == int(expected["source_line_count"]),
    )


def main(
    *,
    database: str | None = None,
    retention_days: int = DEFAULT_RETENTION_DAYS,
    validate_after_write: bool = True,
    metadata: dict[str, Any] | None = None,
) -> pd.DataFrame:
    """Run the eDART raw TXT file scrape, upsert, retention purge, and validation."""
    database = database or credentials.AZURE_POSTGRESQL_DB_NAME
    run_id = str(uuid4())
    run_logger = script_logging.init_logging(
        name=API_SCRAPE_NAME,
        log_dir=script_logging.get_log_dir(Path(__file__).parent / "logs"),
        log_to_file=True,
        delete_if_no_errors=True,
    )
    pull_result: PullResult | None = None
    rows_written = 0

    try:
        run_logger.header(API_SCRAPE_NAME)
        run_logger.info(f"Run ID: {run_id}")

        run_logger.section("Pulling PJM eDART linesout.txt...")
        pull_result = pull_linesout_text(
            run_id=run_id,
            database=database,
            metadata=metadata,
        )
        if pull_result.throttled:
            run_logger.warning(
                "PJM eDART returned a throttle/no-change response; skipping upsert."
            )
            _log_successful_fetch(
                pull_result=pull_result,
                run_id=run_id,
                rows_returned=0,
                rows_written=0,
                metadata={**(metadata or {}), "throttled": True},
                database=database,
            )
            return pd.DataFrame(columns=RAW_COLUMNS)

        run_logger.section("Preparing raw source file row...")
        df = parse_linesout_text(
            pull_result.text,
            source_content_type=pull_result.content_type,
            source_content_length=pull_result.content_length,
        )
        report_timestamp = (
            df["source_report_timestamp"].iloc[0] if not df.empty else "n/a"
        )
        run_logger.info(
            "Prepared 1 raw TXT file row from report timestamp "
            f"{report_timestamp}."
        )

        run_logger.section(f"Upserting 1 raw TXT file into {TARGET_TABLE_FQN}...")
        rows_written = upsert_transmission_outages_raw(df, database=database)

        deleted_rows = 0
        if rows_written:
            deleted_rows = purge_retention(
                retention_days=retention_days,
                database=database,
            )
            run_logger.section(
                "Retention purge removed "
                f"{deleted_rows} source files older than {retention_days} days."
            )

        validation: ValidationResult | None = None
        if validate_after_write and rows_written:
            run_logger.section("Validating stored raw TXT against source text...")
            validation = validate_table_against_text(
                pull_result.text,
                database=database,
            )
            if not validation.ok:
                raise RuntimeError(
                    "Raw transmission outage file validation failed: "
                    f"source_files={validation.source_files}, "
                    f"table_files={validation.table_files}, "
                    f"raw_text_matches={validation.raw_text_matches}, "
                    f"timestamp_matches={validation.timestamp_matches}, "
                    f"line_count_matches={validation.line_count_matches}"
                )
            run_logger.success(
                "Validated raw TXT file against source_file_sha256="
                f"{validation.source_file_sha256}."
            )

        _log_successful_fetch(
            pull_result=pull_result,
            run_id=run_id,
            rows_returned=len(df),
            rows_written=rows_written,
            metadata={
                **(metadata or {}),
                "retention_days": retention_days,
                "deleted_rows": deleted_rows,
                "validated": bool(validation and validation.ok),
                "source_line_count": int(df["source_line_count"].iloc[0]),
            },
            database=database,
        )
        run_logger.success(
            f"{API_SCRAPE_NAME} completed; {rows_written} raw TXT file written."
        )
        return df

    except Exception as exc:
        run_logger.exception(f"Pipeline failed: {exc}")
        if pull_result is not None:
            _log_failed_fetch(
                pull_result=pull_result,
                run_id=run_id,
                error=exc,
                rows_written=rows_written,
                metadata=metadata,
                database=database,
            )
        raise

    finally:
        script_logging.close_logging()


def _extract_text(content: bytes) -> str:
    try:
        with zipfile.ZipFile(io.BytesIO(content)) as zf:
            names = zf.namelist()
            txt_name = next(
                (name for name in names if name.lower().endswith(".txt")),
                names[0],
            )
            return zf.read(txt_name).decode("utf-8", errors="replace")
    except zipfile.BadZipFile:
        return content.decode("utf-8", errors="replace")


def _parse_report_timestamp(text: str) -> datetime:
    first_line = text.splitlines()[0] if text.splitlines() else ""
    match = TIMESTAMP_RE.search(first_line)
    if not match:
        raise ValueError("linesout.txt is missing TIMESTAMP header")
    return datetime.strptime(match.group(1), "%m-%d-%Y %H:%M:%S")


def _is_throttle_response(text: str) -> bool:
    return bool(THROTTLE_RE.search(text))


def _sha256_text(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def _line_count(text: str) -> int:
    return len(text.splitlines())


def _db_value(value: Any) -> Any:
    if value is None:
        return None
    try:
        if pd.isna(value):
            return None
    except (TypeError, ValueError):
        pass
    if isinstance(value, pd.Timestamp):
        return value.to_pydatetime()
    return value


def _canonical_value(value: Any) -> Any:
    value = _db_value(value)
    if isinstance(value, datetime):
        return value.isoformat(sep=" ")
    return value


def _validate_frame_columns(df: pd.DataFrame) -> None:
    missing = [column for column in RAW_COLUMNS if column not in df.columns]
    if missing:
        raise ValueError(f"Raw transmission outage frame missing columns: {missing}")


def _log_successful_fetch(
    *,
    pull_result: PullResult,
    run_id: str,
    rows_returned: int,
    rows_written: int,
    metadata: dict[str, Any] | None,
    database: str | None,
) -> None:
    parsed_url = urlsplit(LINESOUT_URL)
    log_api_fetch(
        actor_type="scrape",
        provider="pjm_edart",
        pipeline_name=API_SCRAPE_NAME,
        run_id=run_id,
        operation_name="linesout_txt",
        feed_name="linesout.txt",
        target_table=TARGET_TABLE_FQN,
        method="GET",
        target_host=parsed_url.netloc,
        target_path=parsed_url.path,
        status="success",
        http_status=pull_result.http_status,
        elapsed_ms=pull_result.elapsed_ms,
        rows_returned=rows_returned,
        rows_written=rows_written,
        metadata={
            **(metadata or {}),
            "content_type": pull_result.content_type,
            "content_length": pull_result.content_length,
            "source_file_sha256": pull_result.source_file_sha256,
        },
        database=database,
    )


def _log_failed_fetch(
    *,
    pull_result: PullResult,
    run_id: str,
    error: Exception,
    rows_written: int,
    metadata: dict[str, Any] | None,
    database: str | None,
) -> None:
    parsed_url = urlsplit(LINESOUT_URL)
    log_api_fetch(
        actor_type="scrape",
        provider="pjm_edart",
        pipeline_name=API_SCRAPE_NAME,
        run_id=run_id,
        operation_name="linesout_txt",
        feed_name="linesout.txt",
        target_table=TARGET_TABLE_FQN,
        method="GET",
        target_host=parsed_url.netloc,
        target_path=parsed_url.path,
        status="failure",
        http_status=pull_result.http_status,
        elapsed_ms=pull_result.elapsed_ms,
        rows_written=rows_written,
        error_type=type(error).__name__,
        error_message=str(error),
        metadata={
            **(metadata or {}),
            "content_type": pull_result.content_type,
            "content_length": pull_result.content_length,
            "source_file_sha256": pull_result.source_file_sha256,
            "telemetry_stage": "write_or_validate_raw_file",
        },
        database=database,
    )


def rows_to_json_for_debug(df: pd.DataFrame, limit: int = 5) -> str:
    """Return a redacted sample for local scrape debugging."""
    sample = df.head(limit).to_dict(orient="records")
    return json.dumps(sample, default=str, indent=2)


if __name__ == "__main__":
    main()
