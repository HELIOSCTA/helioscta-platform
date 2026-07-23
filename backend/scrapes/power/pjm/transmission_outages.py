"""PJM eDART transmission outage raw TXT scrape.

Source system: PJM eDART Transmission Facilities Outage List.
Endpoint: https://edart.pjm.com/reports/linesout.txt, served as a ZIP.
Target table: pjm.transmission_outages_raw.
Grain: one parsed outage/equipment record per source TXT file, keyed by
source_file_sha256 x source_row_number, where source_row_number is the first
source line for that parsed record.
Freshness: source_report_timestamp from the TXT TIMESTAMP header.
Retention: source-file captures older than DEFAULT_RETENTION_DAYS by
ingested_at are purged after a successful upsert.

The storage contract is deliberately raw-preserving and frontend-usable. Source
fields are projected into typed columns for sorting/filtering, source_columns
keeps the report labels, raw_line keeps the anchor source line, and
raw_record_text keeps the full raw source text consumed by each parsed record.
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
from decimal import Decimal
from pathlib import Path
from typing import Any
from urllib.parse import urlsplit
from uuid import uuid4

import pandas as pd
import requests
from psycopg2 import sql
from psycopg2.extras import Json, execute_values

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
DEFAULT_RETENTION_DAYS = 180
DEFAULT_TIMEOUT_SECONDS = 120

TIMESTAMP_RE = re.compile(r"TIMESTAMP:(\d{2}-\d{2}-\d{4}\s+\d{2}:\d{2}:\d{2})")
SEPARATOR_RE = re.compile(r"^-{10,}\s*$")
THROTTLE_RE = re.compile(
    r"linesout\.txt file requested by this IP Address has not been updated",
    re.IGNORECASE,
)
DEENERGIZED_SECTION = "DE-ENERGIZED EQUIPMENT"
SCHEDULED_SECTION = "SCHEDULED OUTAGES"
PLANNED_SECTION = "PLANNED OUTAGES"
OUTAGE_SECTIONS = {SCHEDULED_SECTION, PLANNED_SECTION}

ITEM_TICKET_FACILITY_RE = re.compile(
    r"^\s*(?P<item>\d+)\s+(?P<ticket>\d+)\s+(?P<facility_name>.*?)\s*\|?\s*$"
)

SCHEDULED_OUTAGE_RE = re.compile(
    r"^\s*(?P<item>\d+)\s+"
    r"(?P<ticket>\d+)\s+"
    r"(?P<zone_company>\S+)\s+"
    r"(?P<facility_name>.+?)\s+"
    r"(?P<start_datetime>\d{2}-[A-Z]{3}-\d{4}\s+\d{4})\s+"
    r"(?P<end_datetime>\d{2}-[A-Z]{3}-\d{4}\s+\d{4})\s+"
    r"(?P<status>[OC])\s+"
    r"(?P<outage_state>\S+)\s+"
    r"(?P<last_revised>\d{2}/\d{2}/\d{4}\s+\d{2}:\d{2})"
)
EQUIPMENT_CONTINUATION_RE = re.compile(
    r"^\s{10,}"
    r"(?P<zone_company>\S+)\s+"
    r"(?P<facility_name>.+?)\s+"
    r"(?P<start_datetime>\d{2}-[A-Z]{3}-\d{4}\s+\d{4})\s+"
    r"(?P<end_datetime>\d{2}-[A-Z]{3}-\d{4}\s+\d{4})\s+"
    r"(?P<status>[OC])"
    r"(?P<trailing>.*)$"
)
FACILITY_RE = re.compile(
    r"^(?P<equipment_type>\S+)\s+"
    r"(?P<station>.+?)\s+"
    r"(?P<voltage_kv>\d+(?:\.\d+)?)\s+KV\b"
)
RECORD_DELIMITER_RE = re.compile(r"^\+-----\+")
DATE_LOG_RE = re.compile(
    r"^\((?P<start_datetime>\d{2}-[A-Z]{3}-\d{4}\s+\d{4})\s+"
    r"(?P<end_datetime>\d{2}-[A-Z]{3}-\d{4}\s+\d{4})\s+"
    r"(?P<timestamp>\d{2}/\d{2}/\d{4}\s+\d{2}:\d{2})\)$"
)
HISTORY_LOG_RE = re.compile(
    r"^\((?P<status>[A-Za-z]+)\s+(?P<timestamp>\d{2}/\d{2}/\d{4}\s+\d{2}:\d{2})\)$"
)
TRAILING_DATETIME_RE = re.compile(
    r"(?P<timestamp>\d{2}/\d{2}/\d{4}\s+\d{2}:\d{2})\s*$"
)
CAUSE_RE = re.compile(r"\((?P<cause>[^)]+)\)")
STATUS_KEYWORDS = {
    "Active",
    "Approved",
    "Received",
    "Submitted",
    "Withdrawn",
    "Denied",
    "Completed",
    "Complete",
    "Cancelled",
    "Cancelle",
    "Revised",
}
DURATION_KEYWORDS = {"Continuous"}

RAW_COLUMNS = [
    "source_report_timestamp",
    "source_report_timezone",
    "source_file_sha256",
    "source_section",
    "source_row_number",
    "source_end_row_number",
    "record_kind",
    "item_number",
    "ticket_id",
    "zone_company",
    "facility_name",
    "equipment_type",
    "station",
    "voltage_kv",
    "start_datetime",
    "end_datetime",
    "status",
    "outage_state",
    "last_revised",
    "rtep",
    "availability",
    "risk",
    "approval_status",
    "on_time",
    "last_evaluated",
    "equipment_count",
    "cause",
    "source_columns",
    "equipment_rows",
    "date_log",
    "history_log",
    "raw_line",
    "raw_record_text",
    "source_row_hash",
    "ingested_at",
]
JSON_COLUMNS = {"source_columns", "equipment_rows", "date_log", "history_log"}
PRIMARY_KEY_COLUMNS = {"source_file_sha256", "source_row_number"}


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
    source_rows: int
    table_rows: int
    missing_row_numbers: list[int]
    extra_row_numbers: list[int]
    mismatched_row_numbers: list[int]

    @property
    def ok(self) -> bool:
        return (
            self.source_rows == self.table_rows
            and not self.missing_row_numbers
            and not self.extra_row_numbers
            and not self.mismatched_row_numbers
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
        result = PullResult(
            text=text,
            http_status=response.status_code,
            elapsed_ms=elapsed_ms,
            content_type=response.headers.get("Content-Type", ""),
            content_length=len(response.content),
            source_file_sha256=_sha256_text(text),
            throttled=_is_throttle_response(text),
        )
        return result

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
) -> pd.DataFrame:
    """Parse source TXT records into typed columns plus raw source payloads."""
    if _is_throttle_response(text):
        return pd.DataFrame(columns=RAW_COLUMNS)

    source_report_timestamp = _parse_report_timestamp(text)
    source_file_sha256 = _sha256_text(text)
    ingested_at = ingested_at or pd.Timestamp.now(tz="UTC")
    rows: list[dict[str, Any]] = []
    current_section: str | None = None
    current_record: dict[str, Any] | None = None

    for source_row_number, raw_line in enumerate(text.splitlines(), start=1):
        line = raw_line.rstrip("\r\n")
        stripped = _strip_report_pipe(line).strip()

        section = _parse_section(line)
        if section:
            current_record = _flush_record(current_record, rows)
            current_section = section
            continue

        if not stripped:
            continue
        if source_row_number == 1 and stripped.startswith("TIMESTAMP:"):
            continue
        if SEPARATOR_RE.match(stripped):
            continue

        if current_section is None:
            continue

        if current_section == DEENERGIZED_SECTION:
            if _is_deenergized_header(stripped):
                continue
            row = _parse_deenergized_record(
                raw_line=line,
                source_row_number=source_row_number,
                source_report_timestamp=source_report_timestamp,
                source_file_sha256=source_file_sha256,
                ingested_at=ingested_at,
            )
            if row:
                rows.append(row)
            continue

        if current_section in OUTAGE_SECTIONS:
            if _is_scheduled_header_line(stripped):
                continue
            if RECORD_DELIMITER_RE.match(stripped):
                current_record = _flush_record(current_record, rows)
                continue

            header_match = SCHEDULED_OUTAGE_RE.match(line)
            if header_match:
                current_record = _flush_record(current_record, rows)
                current_record = _new_scheduled_record(
                    match=header_match,
                    raw_line=line,
                    source_section=current_section,
                    source_row_number=source_row_number,
                    source_report_timestamp=source_report_timestamp,
                    source_file_sha256=source_file_sha256,
                    ingested_at=ingested_at,
                )
                continue

            if current_record is not None:
                _add_scheduled_continuation(
                    current_record=current_record,
                    raw_line=line,
                    source_row_number=source_row_number,
                )

    _flush_record(current_record, rows)
    return pd.DataFrame(rows, columns=RAW_COLUMNS)


def upsert_transmission_outages_raw(
    df: pd.DataFrame,
    *,
    database: str | None = None,
) -> int:
    """Replace parsed records for each source file in pjm.transmission_outages_raw."""
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

        source_hashes = sorted(str(value) for value in df["source_file_sha256"].unique())
        cursor.execute(
            sql.SQL("DELETE FROM {}.{} WHERE source_file_sha256 = ANY(%s)").format(
                sql.Identifier(TARGET_SCHEMA),
                sql.Identifier(TARGET_TABLE),
            ),
            (source_hashes,),
        )

        rows = [
            tuple(
                Json(value) if column in JSON_COLUMNS else _db_value(value)
                for column, value in zip(RAW_COLUMNS, row, strict=True)
            )
            for row in df[RAW_COLUMNS].itertuples(index=False, name=None)
        ]

        query = sql.SQL(
            """
            INSERT INTO {}.{} ({})
            VALUES %s
            ON CONFLICT (source_file_sha256, source_row_number)
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
    """Purge raw captures outside the configured hot retention window."""
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
    """Compare stored parsed records to records parsed from the source text."""
    expected_df = parse_linesout_text(text)
    if expected_df.empty:
        return ValidationResult(
            source_file_sha256=_sha256_text(text),
            source_rows=0,
            table_rows=0,
            missing_row_numbers=[],
            extra_row_numbers=[],
            mismatched_row_numbers=[],
        )

    source_file_sha256 = str(expected_df["source_file_sha256"].iloc[0])
    validation_columns = [
        column for column in RAW_COLUMNS if column not in {"ingested_at"}
    ]
    table_rows = db.execute_sql(
        f"""
        SELECT {", ".join(validation_columns)}
        FROM pjm.transmission_outages_raw
        WHERE source_file_sha256 = %s
        ORDER BY source_row_number;
        """,
        params=(source_file_sha256,),
        database=database,
        fetch=True,
    )
    actual = {
        int(row["source_row_number"]): _validation_payload(row, validation_columns)
        for row in table_rows or []
    }
    expected = {
        int(row.source_row_number): _validation_payload(
            row._asdict(),
            validation_columns,
        )
        for row in expected_df.itertuples(index=False)
    }
    missing = sorted(set(expected) - set(actual))
    extra = sorted(set(actual) - set(expected))
    mismatched = sorted(
        row_number
        for row_number in set(expected) & set(actual)
        if expected[row_number] != actual[row_number]
    )
    return ValidationResult(
        source_file_sha256=source_file_sha256,
        source_rows=len(expected),
        table_rows=len(actual),
        missing_row_numbers=missing,
        extra_row_numbers=extra,
        mismatched_row_numbers=mismatched,
    )


def main(
    *,
    database: str | None = None,
    retention_days: int = DEFAULT_RETENTION_DAYS,
    validate_after_write: bool = True,
    metadata: dict[str, Any] | None = None,
) -> pd.DataFrame:
    """Run the eDART raw TXT scrape, upsert, retention purge, and validation."""
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

        run_logger.section("Parsing source records...")
        df = parse_linesout_text(pull_result.text)
        report_timestamp = (
            df["source_report_timestamp"].iloc[0] if not df.empty else "n/a"
        )
        run_logger.info(
            f"Parsed {len(df)} source records from report timestamp "
            f"{report_timestamp}."
        )

        run_logger.section(f"Upserting {len(df)} rows into {TARGET_TABLE_FQN}...")
        rows_written = upsert_transmission_outages_raw(df, database=database)

        deleted_rows = 0
        if rows_written:
            deleted_rows = purge_retention(
                retention_days=retention_days,
                database=database,
            )
            run_logger.section(
                "Retention purge removed "
                f"{deleted_rows} rows older than {retention_days} days."
            )

        validation: ValidationResult | None = None
        if validate_after_write and rows_written:
            run_logger.section("Validating table rows against source text...")
            validation = validate_table_against_text(
                pull_result.text,
                database=database,
            )
            if not validation.ok:
                raise RuntimeError(
                    "Raw transmission outage validation failed: "
                    f"source_rows={validation.source_rows}, "
                    f"table_rows={validation.table_rows}, "
                    f"missing={validation.missing_row_numbers[:10]}, "
                    f"extra={validation.extra_row_numbers[:10]}, "
                    f"mismatched={validation.mismatched_row_numbers[:10]}"
                )
            run_logger.success(
                "Validated "
                f"{validation.table_rows} table rows against source_file_sha256="
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
            },
            database=database,
        )
        run_logger.success(
            f"{API_SCRAPE_NAME} completed; {rows_written} rows written."
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
            txt_name = next((name for name in names if name.lower().endswith(".txt")), names[0])
            return zf.read(txt_name).decode("utf-8", errors="replace")
    except zipfile.BadZipFile:
        return content.decode("utf-8", errors="replace")


def _parse_report_timestamp(text: str) -> datetime:
    first_line = text.splitlines()[0] if text.splitlines() else ""
    match = TIMESTAMP_RE.search(first_line)
    if not match:
        raise ValueError("linesout.txt is missing TIMESTAMP header")
    return datetime.strptime(match.group(1), "%m-%d-%Y %H:%M:%S")


def _parse_section(line: str) -> str | None:
    candidate = _strip_report_pipe(line).strip()
    upper_candidate = candidate.upper()
    if not candidate:
        return None
    if DEENERGIZED_SECTION in upper_candidate:
        return DEENERGIZED_SECTION
    if SCHEDULED_SECTION in upper_candidate:
        return SCHEDULED_SECTION
    if PLANNED_SECTION in upper_candidate:
        return PLANNED_SECTION
    return None


def _is_deenergized_header(stripped_line: str) -> bool:
    upper_line = stripped_line.upper()
    return "ITEM" in upper_line and "TICKET" in upper_line and "FACILITY NAME" in upper_line


def _is_scheduled_header_line(stripped_line: str) -> bool:
    upper_line = stripped_line.upper()
    return (
        "ITEM" in upper_line
        or "TICKET" in upper_line
        or "STATUS     LAST_REVISED" in upper_line
        or "DATE_LOG" in upper_line
        or "HISTORY_LOG" in upper_line
        or upper_line.startswith("(START_DATE")
        or upper_line.startswith("(STATUS")
    )


def _parse_deenergized_record(
    *,
    raw_line: str,
    source_row_number: int,
    source_report_timestamp: datetime,
    source_file_sha256: str,
    ingested_at: pd.Timestamp,
) -> dict[str, Any] | None:
    match = ITEM_TICKET_FACILITY_RE.match(raw_line)
    if not match:
        return None

    item_number = int(match.group("item"))
    ticket_id = int(match.group("ticket"))
    facility_name = match.group("facility_name").strip()
    facility = _parse_facility(facility_name)
    source_columns = {
        "ITEM": str(item_number),
        "TICKET": str(ticket_id),
        "FACILITY NAME": facility_name,
    }
    return _base_row(
        source_report_timestamp=source_report_timestamp,
        source_file_sha256=source_file_sha256,
        source_section=DEENERGIZED_SECTION,
        source_row_number=source_row_number,
        source_end_row_number=source_row_number,
        record_kind="deenergized_equipment",
        item_number=item_number,
        ticket_id=ticket_id,
        facility_name=facility_name,
        equipment_type=facility["equipment_type"],
        station=facility["station"],
        voltage_kv=facility["voltage_kv"],
        equipment_count=1,
        source_columns=source_columns,
        raw_line=raw_line,
        raw_record_text=raw_line,
        source_row_hash=_row_hash(text=raw_line),
        ingested_at=ingested_at,
    )


def _new_scheduled_record(
    *,
    match: re.Match[str],
    raw_line: str,
    source_section: str,
    source_row_number: int,
    source_report_timestamp: datetime,
    source_file_sha256: str,
    ingested_at: pd.Timestamp,
) -> dict[str, Any]:
    item_number = int(match.group("item"))
    ticket_id = int(match.group("ticket"))
    zone_company = match.group("zone_company").strip()
    facility_name = match.group("facility_name").strip()
    start_raw = match.group("start_datetime").strip()
    end_raw = match.group("end_datetime").strip()
    last_revised_raw = match.group("last_revised").strip()
    meta = _parse_trailing_scheduled_metadata(raw_line, match.end())
    facility = _parse_facility(facility_name)
    equipment_rows = [
        _equipment_payload(
            source_row_number=source_row_number,
            zone_company=zone_company,
            facility_name=facility_name,
            start_datetime_raw=start_raw,
            end_datetime_raw=end_raw,
            status=match.group("status").strip(),
            outage_type=None,
            is_primary=True,
        )
    ]
    source_columns = {
        "ITEM": str(item_number),
        "TICKET": str(ticket_id),
        "ZONE/CO": zone_company,
        "FACILITY_NAME": facility_name,
        "START_DATE TIME": start_raw,
        "END_DATE TIME": end_raw,
        "OPEN/CLOSED": match.group("status").strip(),
        "STATUS": match.group("outage_state").strip(),
        "LAST_REVISED": last_revised_raw,
        "RTEP": meta["rtep"] or "",
        "AVAIL": meta["availability"] or "",
        "RISK": meta["risk"] or "",
        "PREV_STATUS": meta["approval_status"] or "",
        "ON_TIME": meta["on_time"] or "",
        "LAST_EVALUATED": meta["last_evaluated_raw"] or "",
        "CAUSES": "",
        "DATE_LOG": [],
        "HISTORY_LOG": [],
    }
    row = _base_row(
        source_report_timestamp=source_report_timestamp,
        source_file_sha256=source_file_sha256,
        source_section=source_section,
        source_row_number=source_row_number,
        source_end_row_number=source_row_number,
        record_kind="transmission_outage",
        item_number=item_number,
        ticket_id=ticket_id,
        zone_company=zone_company,
        facility_name=facility_name,
        equipment_type=facility["equipment_type"],
        station=facility["station"],
        voltage_kv=facility["voltage_kv"],
        start_datetime=_parse_pjm_datetime(start_raw),
        end_datetime=_parse_pjm_datetime(end_raw),
        status=match.group("status").strip(),
        outage_state=match.group("outage_state").strip(),
        last_revised=_parse_revised_datetime(last_revised_raw),
        rtep=meta["rtep"],
        availability=meta["availability"],
        risk=meta["risk"],
        approval_status=meta["approval_status"],
        on_time=meta["on_time"],
        last_evaluated=_parse_revised_datetime(meta["last_evaluated_raw"]),
        equipment_count=len(equipment_rows),
        source_columns=source_columns,
        equipment_rows=equipment_rows,
        date_log=[],
        history_log=[],
        raw_line=raw_line,
        raw_record_text=raw_line,
        source_row_hash="",
        ingested_at=ingested_at,
    )
    row["_raw_lines"] = [raw_line]
    row["_causes"] = []
    return row


def _add_scheduled_continuation(
    *,
    current_record: dict[str, Any],
    raw_line: str,
    source_row_number: int,
) -> None:
    stripped = raw_line.strip()
    if not stripped:
        return

    current_record["_raw_lines"].append(raw_line)
    current_record["source_end_row_number"] = source_row_number

    equipment_match = EQUIPMENT_CONTINUATION_RE.match(raw_line)
    if equipment_match:
        outage_type = _extract_parenthesized_cause(
            equipment_match.group("trailing") or ""
        )
        if outage_type and _is_cause_line(outage_type):
            current_record["_causes"].append(outage_type)
        current_record["equipment_rows"].append(
            _equipment_payload(
                source_row_number=source_row_number,
                zone_company=equipment_match.group("zone_company").strip(),
                facility_name=equipment_match.group("facility_name").strip(),
                start_datetime_raw=equipment_match.group("start_datetime").strip(),
                end_datetime_raw=equipment_match.group("end_datetime").strip(),
                status=equipment_match.group("status").strip(),
                outage_type=outage_type,
                is_primary=False,
            )
        )
        current_record["equipment_count"] = len(current_record["equipment_rows"])
        return

    date_log = _parse_date_log(stripped)
    if date_log:
        current_record["date_log"].append(date_log)
        return

    history_log = _parse_history_log(stripped)
    if history_log:
        current_record["history_log"].append(history_log)
        return

    cause = _extract_parenthesized_cause(stripped)
    if cause and _is_cause_line(cause):
        current_record["_causes"].append(cause)


def _flush_record(
    current_record: dict[str, Any] | None,
    rows: list[dict[str, Any]],
) -> None:
    if current_record is None:
        return None

    causes = _dedupe_text(current_record.pop("_causes", []))
    raw_lines = current_record.pop("_raw_lines", [current_record["raw_line"]])
    raw_record_text = "\n".join(raw_lines)
    current_record["cause"] = "; ".join(causes) if causes else None
    current_record["raw_record_text"] = raw_record_text
    current_record["source_row_hash"] = _row_hash(text=raw_record_text)
    current_record["source_columns"]["CAUSES"] = current_record["cause"] or ""
    current_record["source_columns"]["DATE_LOG"] = current_record["date_log"]
    current_record["source_columns"]["HISTORY_LOG"] = current_record["history_log"]
    rows.append({column: current_record.get(column) for column in RAW_COLUMNS})
    return None


def _base_row(**values: Any) -> dict[str, Any]:
    row = {column: None for column in RAW_COLUMNS}
    row.update(
        {
            "source_report_timezone": SOURCE_REPORT_TIMEZONE,
            "equipment_count": 0,
            "source_columns": {},
            "equipment_rows": [],
            "date_log": [],
            "history_log": [],
        }
    )
    row.update(values)
    return row


def _equipment_payload(
    *,
    source_row_number: int,
    zone_company: str,
    facility_name: str,
    start_datetime_raw: str,
    end_datetime_raw: str,
    status: str,
    outage_type: str | None,
    is_primary: bool,
) -> dict[str, Any]:
    facility = _parse_facility(facility_name)
    return {
        "source_row_number": source_row_number,
        "is_primary": is_primary,
        "ZONE/CO": zone_company,
        "FACILITY_NAME": facility_name,
        "START_DATE TIME": start_datetime_raw,
        "END_DATE TIME": end_datetime_raw,
        "OPEN/CLOSED": status,
        "OUTAGE_TYPE": outage_type or "",
        "equipment_type": facility["equipment_type"],
        "station": facility["station"],
        "voltage_kv": facility["voltage_kv"],
    }


def _parse_facility(facility_name: str) -> dict[str, Any]:
    match = FACILITY_RE.match(facility_name)
    if not match:
        return {"equipment_type": None, "station": None, "voltage_kv": None}
    return {
        "equipment_type": match.group("equipment_type").strip(),
        "station": " ".join(match.group("station").split()),
        "voltage_kv": float(match.group("voltage_kv")),
    }


def _parse_trailing_scheduled_metadata(line: str, match_end: int) -> dict[str, str | None]:
    trailing = line[match_end:].strip().rstrip("|").strip()
    metadata: dict[str, str | None] = {
        "rtep": None,
        "availability": None,
        "risk": None,
        "approval_status": None,
        "on_time": None,
        "last_evaluated_raw": None,
    }
    if not trailing:
        return metadata

    last_evaluated = TRAILING_DATETIME_RE.search(trailing)
    if last_evaluated:
        metadata["last_evaluated_raw"] = last_evaluated.group("timestamp")
        trailing = trailing[: last_evaluated.start()].strip()

    parts = [part for part in trailing.split() if part != "|"]
    known_availability = {"Duration"}
    known_yes_no = {"No", "Yes"}
    known_approval = {"Submitted", "Approved", "Received", "Withdrawn", "Denied"}
    idx = 0
    if (
        idx < len(parts)
        and parts[idx] not in known_availability
        and parts[idx] not in known_yes_no
        and parts[idx] not in known_approval
    ):
        metadata["rtep"] = parts[idx]
        idx += 1
    if idx < len(parts) and parts[idx] in known_availability:
        metadata["availability"] = parts[idx]
        idx += 1
    if idx < len(parts) and parts[idx] in known_yes_no:
        metadata["risk"] = parts[idx]
        idx += 1
    if idx < len(parts) and parts[idx] in known_approval:
        metadata["approval_status"] = parts[idx]
        idx += 1
    if idx < len(parts) and parts[idx] in known_yes_no:
        metadata["on_time"] = parts[idx]
    return metadata


def _parse_pjm_datetime(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        return datetime.strptime(value.strip(), "%d-%b-%Y %H%M")
    except ValueError:
        return None


def _parse_revised_datetime(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        return datetime.strptime(value.strip(), "%m/%d/%Y %H:%M")
    except ValueError:
        return None


def _parse_date_log(stripped_line: str) -> dict[str, Any] | None:
    match = DATE_LOG_RE.match(stripped_line)
    if not match:
        return None
    return {
        "START_DATE TIME": match.group("start_datetime").strip(),
        "END_DATE TIME": match.group("end_datetime").strip(),
        "TIMESTAMP": match.group("timestamp").strip(),
    }


def _parse_history_log(stripped_line: str) -> dict[str, str] | None:
    match = HISTORY_LOG_RE.match(stripped_line)
    if not match:
        return None
    return {
        "STATUS": match.group("status").strip(),
        "TIMESTAMP": match.group("timestamp").strip(),
    }


def _extract_parenthesized_cause(text: str) -> str | None:
    match = CAUSE_RE.search(text)
    if not match:
        return None
    return " ".join(match.group("cause").split())


def _is_cause_line(text: str) -> bool:
    if not text:
        return False
    if DATE_LOG_RE.match(f"({text})"):
        return False
    if text.strip() in DURATION_KEYWORDS:
        return False
    first_word = text.split()[0]
    return first_word not in STATUS_KEYWORDS


def _dedupe_text(values: list[str]) -> list[str]:
    seen: set[str] = set()
    deduped: list[str] = []
    for value in values:
        normalized = " ".join(value.split())
        if normalized and normalized not in seen:
            seen.add(normalized)
            deduped.append(normalized)
    return deduped


def _strip_report_pipe(line: str) -> str:
    return line.rstrip().removesuffix("|").rstrip()


def _is_throttle_response(text: str) -> bool:
    return bool(THROTTLE_RE.search(text))


def _sha256_text(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def _row_hash(*, text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def _db_value(value: Any) -> Any:
    if isinstance(value, (dict, list)):
        return value
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


def _validation_payload(row: dict[str, Any], columns: list[str]) -> tuple[Any, ...]:
    return tuple(_canonical_value(row.get(column)) for column in columns)


def _canonical_value(value: Any) -> Any:
    value = _db_value(value)
    if isinstance(value, datetime):
        return value.isoformat(sep=" ")
    if isinstance(value, Decimal):
        return f"{value.normalize():f}"
    if isinstance(value, (dict, list)):
        return json.dumps(value, sort_keys=True, default=str)
    if isinstance(value, float):
        return f"{value:g}"
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
            "telemetry_stage": "parse_write_or_validate",
        },
        database=database,
    )


def rows_to_json_for_debug(df: pd.DataFrame, limit: int = 5) -> str:
    """Return a redacted sample for local parser debugging."""
    sample = df.head(limit).to_dict(orient="records")
    return json.dumps(sample, default=str, indent=2)


if __name__ == "__main__":
    main()
