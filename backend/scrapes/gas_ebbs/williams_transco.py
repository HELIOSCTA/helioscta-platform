"""Williams 1Line Transco gas EBB notice scrape helpers.

Source contract:
- Source system: Williams 1Line public EBB.
- Pipeline: Transco, ``buid=80``.
- Listing endpoints: ``notice_list.jsf`` for critical and non-critical
  notices with ``archive=N``.
- Detail endpoint: ``/1Line/wgp/download`` by source notice ID.
- Destination tables: ``gas_ebbs.notices``, ``gas_ebbs.notice_revisions``,
  ``gas_ebbs.notice_details``, and ``gas_ebbs.planned_outages``.
- Primary source grain: ``source_family x pipeline_key x source_notice_id``.
- Safe rerun: listing rows upsert by source notice ID; revisions/details insert
  once per source content hash; missing notices are marked stale only after
  both listing streams succeed.
"""

from __future__ import annotations

import hashlib
import json
import re
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from html.parser import HTMLParser
from typing import Any
from urllib.parse import parse_qs, urlencode, urljoin, urlsplit, urlunsplit

import requests
from dateutil import parser as date_parser
from dateutil import tz
from psycopg2 import sql
from psycopg2.extras import Json, execute_values

from backend.utils import db


SOURCE_FAMILY = "williams_1line"
PIPELINE_KEY = "williams_transco"
PIPELINE_NAME = "Williams Transco"
BUID = 80
BASE_URL = "https://www.1line.williams.com"
LISTING_PATH = "/xhtml/notice_list.jsf"
DETAIL_PATH = "/1Line/wgp/download"
TARGET_SCHEMA = "gas_ebbs"
NOTICES_TABLE = "notices"
NOTICE_REVISIONS_TABLE = "notice_revisions"
NOTICE_DETAILS_TABLE = "notice_details"
PLANNED_OUTAGES_TABLE = "planned_outages"
NOTICES_TABLE_FQN = f"{TARGET_SCHEMA}.{NOTICES_TABLE}"
NOTICE_REVISIONS_TABLE_FQN = f"{TARGET_SCHEMA}.{NOTICE_REVISIONS_TABLE}"
NOTICE_DETAILS_TABLE_FQN = f"{TARGET_SCHEMA}.{NOTICE_DETAILS_TABLE}"
PLANNED_OUTAGES_TABLE_FQN = f"{TARGET_SCHEMA}.{PLANNED_OUTAGES_TABLE}"
DEFAULT_TIMEOUT_SECONDS = 120
DEFAULT_MAX_DETAIL_FETCHES = 25
DEFAULT_BUSINESS_RETENTION_DAYS = 365
DEFAULT_SUPPORTING_RETENTION_DAYS = 30

STREAM_CRITICAL = "critical"
STREAM_NONCRITICAL = "noncritical"
STREAMS = (STREAM_CRITICAL, STREAM_NONCRITICAL)

_DETAIL_ONCLICK_RE = re.compile(r"window\.open\('([^']+)'", re.IGNORECASE)
_SPACE_RE = re.compile(r"[ \t\r\f\v]+")
_HEADER_RE = re.compile(r"[^a-z0-9]+")
_SOURCE_TZINFOS = {
    "CDT": tz.tzoffset("CDT", -5 * 60 * 60),
    "CST": tz.tzoffset("CST", -6 * 60 * 60),
}


@dataclass(frozen=True)
class FetchResult:
    """HTTP response data used by orchestration and telemetry."""

    url: str
    text: str
    http_status: int
    elapsed_ms: int
    content_type: str
    content_length: int


@dataclass(frozen=True)
class NoticeListing:
    """One notice row from the Williams listing table."""

    source_family: str
    pipeline_key: str
    pipeline_name: str
    buid: int
    notice_stream: str
    source_notice_id: str
    critical_ind: bool
    notice_type: str | None
    subject: str | None
    posted_at_utc: datetime | None
    posted_at_source: str | None
    effective_at_utc: datetime | None
    effective_at_source: str | None
    end_at_utc: datetime | None
    end_at_source: str | None
    response_at_utc: datetime | None
    response_at_source: str | None
    detail_url: str
    download_url: str | None
    listing_url: str
    listing_content_hash: str


@dataclass(frozen=True)
class NoticeState:
    """Current database state used for detail fetch selection."""

    source_notice_id: str
    latest_listing_content_hash: str | None
    latest_detail_content_hash: str | None
    latest_source_content_hash: str | None


@dataclass(frozen=True)
class ParsedDetail:
    """Cleaned notice detail payload."""

    detail_metadata: dict[str, str]
    detail_clean_text: str
    notice_text: str
    supporting_data: list[dict[str, Any]]
    raw_detail_sha256: str
    detail_content_hash: str


@dataclass(frozen=True)
class NoticeRevision:
    """Revision row derived from a listing plus fetched detail."""

    source_content_hash: str
    listing_content_hash: str
    detail_content_hash: str
    metadata: dict[str, Any]


def build_listing_url(stream: str) -> str:
    """Return the direct Williams JSF listing URL for one stream."""
    if stream not in STREAMS:
        raise ValueError(f"Unknown Williams Transco notice stream: {stream}")
    critical_ind = "Y" if stream == STREAM_CRITICAL else "N"
    query = urlencode(
        {
            "buid": str(BUID),
            "type": "-1",
            "type2": "-1",
            "archive": "N",
            "critical_ind": critical_ind,
            "hfSortField": "posted_date",
            "hfSortDir": "DESC",
        }
    )
    return urlunsplit(("https", urlsplit(BASE_URL).netloc, LISTING_PATH, query, ""))


def build_detail_url(source_notice_id: str) -> str:
    """Return the canonical Williams popup detail URL for a notice ID."""
    query = urlencode(
        {
            "delvid": str(source_notice_id),
            "hfNoticeFlag": "Y",
            "hfDownloadFlag": "false",
            "hfFileName": "download.html",
        }
    )
    return urlunsplit(("https", urlsplit(BASE_URL).netloc, DETAIL_PATH, query, ""))


def fetch_text(
    url: str,
    *,
    session: requests.Session | None = None,
    timeout_seconds: int = DEFAULT_TIMEOUT_SECONDS,
) -> FetchResult:
    """Fetch a Williams source page and return response text plus timings."""
    http = session or requests.Session()
    started_at = time.perf_counter()
    response = http.get(url, timeout=timeout_seconds)
    elapsed_ms = round((time.perf_counter() - started_at) * 1000)
    response.raise_for_status()
    return FetchResult(
        url=url,
        text=response.text,
        http_status=response.status_code,
        elapsed_ms=elapsed_ms,
        content_type=response.headers.get("Content-Type", ""),
        content_length=len(response.content),
    )


def parse_listing_page(
    html_text: str,
    *,
    stream: str,
    listing_url: str | None = None,
) -> list[NoticeListing]:
    """Parse active Williams notice rows from a listing HTML page."""
    listing_url = listing_url or build_listing_url(stream)
    critical_ind = stream == STREAM_CRITICAL
    parser = _ListingTableParser()
    parser.feed(html_text)
    parser.close()

    if not parser.found_notice_table:
        raise ValueError("Williams notice listing table was not found")

    notices: list[NoticeListing] = []
    for cells in parser.rows:
        if len(cells) < 6:
            continue
        source_notice_id = _clean_text(cells[4].text)
        if not source_notice_id or not source_notice_id.isdigit():
            continue

        notice_type = _none_if_blank(cells[0].text)
        posted_at_source = _none_if_blank(cells[1].text)
        effective_at_source = _none_if_blank(cells[2].text)
        end_at_source = _none_if_blank(cells[3].text)
        subject = _none_if_blank(cells[5].text)
        response_at_source = _none_if_blank(cells[6].text) if len(cells) > 6 else None
        detail_url = _extract_detail_url(cells[5], source_notice_id)
        download_url = _extract_download_url(cells[7]) if len(cells) > 7 else None

        listing_payload = {
            "source_family": SOURCE_FAMILY,
            "pipeline_key": PIPELINE_KEY,
            "source_notice_id": source_notice_id,
            "notice_stream": stream,
            "critical_ind": critical_ind,
            "notice_type": notice_type,
            "posted_at_source": posted_at_source,
            "effective_at_source": effective_at_source,
            "end_at_source": end_at_source,
            "subject": subject,
            "response_at_source": response_at_source,
            "detail_url": detail_url,
            "download_url": download_url,
        }
        notices.append(
            NoticeListing(
                source_family=SOURCE_FAMILY,
                pipeline_key=PIPELINE_KEY,
                pipeline_name=PIPELINE_NAME,
                buid=BUID,
                notice_stream=stream,
                source_notice_id=source_notice_id,
                critical_ind=critical_ind,
                notice_type=notice_type,
                subject=subject,
                posted_at_utc=parse_source_timestamp(posted_at_source),
                posted_at_source=posted_at_source,
                effective_at_utc=parse_source_timestamp(effective_at_source),
                effective_at_source=effective_at_source,
                end_at_utc=parse_source_timestamp(end_at_source),
                end_at_source=end_at_source,
                response_at_utc=parse_source_timestamp(response_at_source),
                response_at_source=response_at_source,
                detail_url=detail_url,
                download_url=download_url,
                listing_url=listing_url,
                listing_content_hash=_hash_payload(listing_payload),
            )
        )

    if not notices and not _has_explicit_no_records_marker(html_text):
        raise ValueError("Williams notice listing parsed zero notice rows")

    return notices


def parse_detail_page(html_text: str) -> ParsedDetail:
    """Parse a Williams notice detail page into cleaned text and metadata."""
    detail_metadata = _extract_detail_metadata(html_text)
    detail_clean_text = html_to_text(html_text)
    notice_text = _extract_notice_text(detail_clean_text)
    supporting_data = _extract_supporting_tables(html_text)
    payload = {
        "detail_metadata": detail_metadata,
        "notice_text": notice_text,
        "supporting_data": supporting_data,
    }
    return ParsedDetail(
        detail_metadata=detail_metadata,
        detail_clean_text=detail_clean_text,
        notice_text=notice_text,
        supporting_data=supporting_data,
        raw_detail_sha256=_sha256_text(html_text),
        detail_content_hash=_hash_payload(payload),
    )


def build_notice_revision(
    listing: NoticeListing,
    detail: ParsedDetail,
    *,
    observed_at_utc: datetime,
) -> NoticeRevision:
    """Build the canonical revision hashes for a listing/detail pair."""
    metadata = {
        "listing": {
            "notice_stream": listing.notice_stream,
            "critical_ind": listing.critical_ind,
            "notice_type": listing.notice_type,
            "subject": listing.subject,
            "posted_at_source": listing.posted_at_source,
            "effective_at_source": listing.effective_at_source,
            "end_at_source": listing.end_at_source,
            "response_at_source": listing.response_at_source,
            "detail_url": listing.detail_url,
            "download_url": listing.download_url,
        },
        "detail": detail.detail_metadata,
        "observed_at_utc": observed_at_utc.isoformat(),
    }
    source_content_hash = _hash_payload(
        {
            "source_family": listing.source_family,
            "pipeline_key": listing.pipeline_key,
            "source_notice_id": listing.source_notice_id,
            "listing_content_hash": listing.listing_content_hash,
            "detail_content_hash": detail.detail_content_hash,
        }
    )
    return NoticeRevision(
        source_content_hash=source_content_hash,
        listing_content_hash=listing.listing_content_hash,
        detail_content_hash=detail.detail_content_hash,
        metadata=metadata,
    )


def select_detail_candidates(
    listings: list[NoticeListing],
    existing_state: dict[str, NoticeState],
    *,
    max_detail_fetches: int = DEFAULT_MAX_DETAIL_FETCHES,
) -> list[NoticeListing]:
    """Return new or listing-changed notices that need detail refresh."""
    candidates: list[NoticeListing] = []
    for listing in listings:
        state = existing_state.get(listing.source_notice_id)
        if state is None:
            candidates.append(listing)
            continue
        if state.latest_detail_content_hash is None:
            candidates.append(listing)
            continue
        if state.latest_listing_content_hash != listing.listing_content_hash:
            candidates.append(listing)

    candidates.sort(
        key=lambda item: item.posted_at_utc or datetime.min.replace(tzinfo=timezone.utc),
        reverse=True,
    )
    if max_detail_fetches < 0:
        raise ValueError("max_detail_fetches must be >= 0")
    return candidates[:max_detail_fetches]


def parse_source_timestamp(value: str | None) -> datetime | None:
    """Parse Williams Central-time timestamp text into UTC."""
    value = _none_if_blank(value)
    if value is None:
        return None
    parsed = date_parser.parse(value, tzinfos=_SOURCE_TZINFOS)
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=tz.gettz("America/Chicago"))
    return parsed.astimezone(timezone.utc)


def html_to_text(html_text: str) -> str:
    """Convert source HTML to compact readable text using stdlib parsing."""
    parser = _TextParser()
    parser.feed(html_text)
    parser.close()
    return _clean_multiline_text("".join(parser.parts))


def extract_planned_outages(
    listing: NoticeListing,
    detail: ParsedDetail,
    *,
    source_content_hash: str,
    derived_at_utc: datetime,
) -> list[dict[str, Any]]:
    """Extract structured maintenance/constraint rows when table shape is clear."""
    if not _is_outage_candidate(listing, detail):
        return []

    outage_rows: list[dict[str, Any]] = []
    sequence = 0
    for table in detail.supporting_data:
        headers = table.get("headers") or []
        if not _has_planned_outage_headers(headers):
            continue
        title = table.get("title")
        for row in table.get("rows") or []:
            location_id = _first_value(row, "loc_id", "location_id")
            location_name = _first_value(row, "location_name")
            job_number = _first_value(row, "job", "job_number")
            if not (location_id and location_name and job_number):
                continue
            sequence += 1
            outage_rows.append(
                {
                    "source_family": listing.source_family,
                    "pipeline_key": listing.pipeline_key,
                    "source_notice_id": listing.source_notice_id,
                    "source_content_hash": source_content_hash,
                    "outage_sequence": sequence,
                    "classification": "maintenance_tsb_constraint",
                    "confidence": 0.9,
                    "notice_type": listing.notice_type,
                    "subject": listing.subject,
                    "effective_start_at_utc": listing.effective_at_utc,
                    "effective_end_at_utc": listing.end_at_utc,
                    "location_id": location_id,
                    "location_name": location_name,
                    "zone": _first_value(row, "zn", "zone"),
                    "delivery_receipt": _first_value(row, "del_rec", "delivery_receipt"),
                    "tsb_type": _first_value(row, "type_of_tsb", "tsb_type"),
                    "available_capacity_mdt_per_day": _parse_number(
                        _first_value(row, "available_capacity_mdt_d", "available_capacity")
                    ),
                    "highest_priority_included": _first_value(
                        row,
                        "highest_priority_included",
                    ),
                    "flow_direction": _first_value(row, "flow_dir", "flow_direction"),
                    "job_number": job_number,
                    "source_table_title": title,
                    "source_row_json": row,
                    "derived_at_utc": derived_at_utc,
                }
            )
    return outage_rows


def fetch_notice_state(
    notice_ids: list[str],
    *,
    database: str | None = None,
) -> dict[str, NoticeState]:
    """Load current notice hashes for detail fetch selection."""
    if not notice_ids:
        return {}
    rows = db.execute_sql(
        """
        SELECT
            source_notice_id,
            latest_listing_content_hash,
            latest_detail_content_hash,
            latest_source_content_hash
        FROM gas_ebbs.notices
        WHERE source_family = %s
          AND pipeline_key = %s
          AND source_notice_id = ANY(%s::text[]);
        """,
        params=(SOURCE_FAMILY, PIPELINE_KEY, list(notice_ids)),
        database=database,
        fetch=True,
    )
    return {
        str(row["source_notice_id"]): NoticeState(
            source_notice_id=str(row["source_notice_id"]),
            latest_listing_content_hash=row.get("latest_listing_content_hash"),
            latest_detail_content_hash=row.get("latest_detail_content_hash"),
            latest_source_content_hash=row.get("latest_source_content_hash"),
        )
        for row in rows or []
    }


def upsert_notices(
    listings: list[NoticeListing],
    *,
    scrape_run_at_utc: datetime,
    database: str | None = None,
) -> int:
    """Upsert listing rows into ``gas_ebbs.notices``."""
    if not listings:
        return 0

    columns = [
        "source_family",
        "pipeline_key",
        "pipeline_name",
        "buid",
        "notice_stream",
        "source_notice_id",
        "critical_ind",
        "notice_type",
        "subject",
        "posted_at_utc",
        "posted_at_source",
        "effective_at_utc",
        "effective_at_source",
        "end_at_utc",
        "end_at_source",
        "response_at_utc",
        "response_at_source",
        "detail_url",
        "download_url",
        "listing_url",
        "latest_listing_content_hash",
        "is_current_on_ebb",
        "first_seen_at_utc",
        "last_seen_at_utc",
    ]
    rows = [
        (
            item.source_family,
            item.pipeline_key,
            item.pipeline_name,
            item.buid,
            item.notice_stream,
            item.source_notice_id,
            item.critical_ind,
            item.notice_type,
            item.subject,
            item.posted_at_utc,
            item.posted_at_source,
            item.effective_at_utc,
            item.effective_at_source,
            item.end_at_utc,
            item.end_at_source,
            item.response_at_utc,
            item.response_at_source,
            item.detail_url,
            item.download_url,
            item.listing_url,
            item.listing_content_hash,
            True,
            scrape_run_at_utc,
            scrape_run_at_utc,
        )
        for item in listings
    ]
    update_columns = [
        column
        for column in columns
        if column
        not in {
            "source_family",
            "pipeline_key",
            "source_notice_id",
            "first_seen_at_utc",
        }
    ]

    connection = None
    cursor = None
    try:
        connection = db.connect(database=database)
        cursor = connection.cursor()
        cursor.execute(
            sql.SQL("SELECT 1 FROM {}.{} LIMIT 0").format(
                sql.Identifier(TARGET_SCHEMA),
                sql.Identifier(NOTICES_TABLE),
            )
        )
        query = sql.SQL(
            """
            INSERT INTO {}.{} ({})
            VALUES %s
            ON CONFLICT (source_family, pipeline_key, source_notice_id)
            DO UPDATE SET {},
                first_missing_at_utc = NULL,
                stale_at_utc = NULL,
                updated_at = NOW();
            """
        ).format(
            sql.Identifier(TARGET_SCHEMA),
            sql.Identifier(NOTICES_TABLE),
            sql.SQL(", ").join(sql.Identifier(column) for column in columns),
            sql.SQL(", ").join(
                sql.SQL("{} = EXCLUDED.{}").format(
                    sql.Identifier(column),
                    sql.Identifier(column),
                )
                for column in update_columns
            ),
        )
        execute_values(cursor, query.as_string(connection), rows, page_size=1000)
        affected = cursor.rowcount
        connection.commit()
        return max(0, affected)
    except Exception:
        if connection:
            connection.rollback()
        raise
    finally:
        if cursor:
            cursor.close()
        if connection:
            connection.close()


def mark_missing_notices(
    current_notice_ids: list[str],
    *,
    missing_at_utc: datetime,
    database: str | None = None,
) -> int:
    """Mark notices missing from the successful full listing run as stale."""
    rows = db.execute_sql(
        """
        WITH updated AS (
            UPDATE gas_ebbs.notices
            SET
                is_current_on_ebb = FALSE,
                first_missing_at_utc = COALESCE(first_missing_at_utc, %s),
                stale_at_utc = COALESCE(stale_at_utc, %s),
                updated_at = NOW()
            WHERE source_family = %s
              AND pipeline_key = %s
              AND is_current_on_ebb = TRUE
              AND NOT (source_notice_id = ANY(%s::text[]))
            RETURNING 1
        )
        SELECT COUNT(*) AS affected_rows
        FROM updated;
        """,
        params=(
            missing_at_utc,
            missing_at_utc,
            SOURCE_FAMILY,
            PIPELINE_KEY,
            list(current_notice_ids),
        ),
        database=database,
        fetch=True,
    )
    return int((rows or [{"affected_rows": 0}])[0]["affected_rows"])


def insert_revision_detail_and_outages(
    listing: NoticeListing,
    detail: ParsedDetail,
    revision: NoticeRevision,
    *,
    detail_fetched_at_utc: datetime,
    planned_outages: list[dict[str, Any]],
    database: str | None = None,
) -> dict[str, int]:
    """Insert revision/detail rows and update notice-level latest detail state."""
    connection = None
    cursor = None
    try:
        connection = db.connect(database=database)
        cursor = connection.cursor()
        cursor.execute(
            sql.SQL("SELECT 1 FROM {}.{} LIMIT 0").format(
                sql.Identifier(TARGET_SCHEMA),
                sql.Identifier(NOTICE_REVISIONS_TABLE),
            )
        )
        revision_inserted = _insert_notice_revision(
            cursor=cursor,
            listing=listing,
            detail=detail,
            revision=revision,
            detail_fetched_at_utc=detail_fetched_at_utc,
        )
        detail_inserted = _insert_notice_detail(
            cursor=cursor,
            listing=listing,
            detail=detail,
            revision=revision,
            detail_fetched_at_utc=detail_fetched_at_utc,
        )
        outages_inserted = _insert_planned_outages(
            cursor=cursor,
            planned_outages=planned_outages,
        )
        _update_notice_detail_success(
            cursor=cursor,
            listing=listing,
            detail=detail,
            revision=revision,
            detail_fetched_at_utc=detail_fetched_at_utc,
        )
        connection.commit()
        return {
            "revision_rows_inserted": revision_inserted,
            "detail_rows_inserted": detail_inserted,
            "planned_outage_rows_inserted": outages_inserted,
        }
    except Exception:
        if connection:
            connection.rollback()
        raise
    finally:
        if cursor:
            cursor.close()
        if connection:
            connection.close()


def mark_detail_failure(
    listing: NoticeListing,
    *,
    error: Exception,
    failed_at_utc: datetime,
    database: str | None = None,
) -> None:
    """Record the latest detail failure without clearing listing data."""
    db.execute_sql(
        """
        UPDATE gas_ebbs.notices
        SET
            last_detail_error_at_utc = %s,
            last_detail_error_message = %s,
            updated_at = NOW()
        WHERE source_family = %s
          AND pipeline_key = %s
          AND source_notice_id = %s;
        """,
        params=(
            failed_at_utc,
            str(error)[:2000],
            listing.source_family,
            listing.pipeline_key,
            listing.source_notice_id,
        ),
        database=database,
    )


def purge_retention(
    *,
    business_retention_days: int = DEFAULT_BUSINESS_RETENTION_DAYS,
    supporting_retention_days: int = DEFAULT_SUPPORTING_RETENTION_DAYS,
    database: str | None = None,
) -> dict[str, int]:
    """Purge non-current rows outside the gas EBB retention windows."""
    if business_retention_days < 1 or supporting_retention_days < 1:
        raise ValueError("retention days must be >= 1")

    specs = [
        (
            "notice_details",
            supporting_retention_days,
            """
            DELETE FROM gas_ebbs.notice_details d
            USING gas_ebbs.notices n
            WHERE n.source_family = d.source_family
              AND n.pipeline_key = d.pipeline_key
              AND n.source_notice_id = d.source_notice_id
              AND n.is_current_on_ebb = FALSE
              AND n.stale_at_utc < NOW() - (%s::int * INTERVAL '1 day')
            """,
        ),
        (
            "planned_outages",
            business_retention_days,
            """
            DELETE FROM gas_ebbs.planned_outages p
            USING gas_ebbs.notices n
            WHERE n.source_family = p.source_family
              AND n.pipeline_key = p.pipeline_key
              AND n.source_notice_id = p.source_notice_id
              AND n.is_current_on_ebb = FALSE
              AND p.derived_at_utc < NOW() - (%s::int * INTERVAL '1 day')
            """,
        ),
        (
            "notice_revisions",
            business_retention_days,
            """
            DELETE FROM gas_ebbs.notice_revisions r
            USING gas_ebbs.notices n
            WHERE n.source_family = r.source_family
              AND n.pipeline_key = r.pipeline_key
              AND n.source_notice_id = r.source_notice_id
              AND n.is_current_on_ebb = FALSE
              AND r.revision_observed_at_utc < NOW() - (%s::int * INTERVAL '1 day')
            """,
        ),
        (
            "notices",
            business_retention_days,
            """
            DELETE FROM gas_ebbs.notices n
            WHERE n.is_current_on_ebb = FALSE
              AND n.stale_at_utc < NOW() - (%s::int * INTERVAL '1 day')
            """,
        ),
    ]

    deleted: dict[str, int] = {}
    connection = None
    cursor = None
    try:
        connection = db.connect(database=database)
        cursor = connection.cursor()
        for table_name, retention_days, delete_sql in specs:
            cursor.execute(
                f"""
                WITH deleted AS (
                    {delete_sql}
                    RETURNING 1
                )
                SELECT COUNT(*) AS deleted_rows
                FROM deleted;
                """,
                (retention_days,),
            )
            deleted[table_name] = int(cursor.fetchone()[0])
        connection.commit()
        return deleted
    except Exception:
        if connection:
            connection.rollback()
        raise
    finally:
        if cursor:
            cursor.close()
        if connection:
            connection.close()


def _insert_notice_revision(
    *,
    cursor: Any,
    listing: NoticeListing,
    detail: ParsedDetail,
    revision: NoticeRevision,
    detail_fetched_at_utc: datetime,
) -> int:
    cursor.execute(
        """
        INSERT INTO gas_ebbs.notice_revisions (
            source_family,
            pipeline_key,
            source_notice_id,
            source_content_hash,
            listing_content_hash,
            detail_content_hash,
            notice_stream,
            critical_ind,
            notice_type,
            subject,
            posted_at_utc,
            effective_at_utc,
            end_at_utc,
            response_at_utc,
            detail_url,
            download_url,
            revision_observed_at_utc,
            detail_fetched_at_utc,
            source_url,
            metadata
        )
        VALUES (
            %s, %s, %s, %s, %s, %s, %s, %s, %s, %s,
            %s, %s, %s, %s, %s, %s, %s, %s, %s, %s::jsonb
        )
        ON CONFLICT (
            source_family,
            pipeline_key,
            source_notice_id,
            source_content_hash
        )
        DO NOTHING;
        """,
        (
            listing.source_family,
            listing.pipeline_key,
            listing.source_notice_id,
            revision.source_content_hash,
            revision.listing_content_hash,
            revision.detail_content_hash,
            listing.notice_stream,
            listing.critical_ind,
            listing.notice_type,
            listing.subject,
            listing.posted_at_utc,
            listing.effective_at_utc,
            listing.end_at_utc,
            listing.response_at_utc,
            listing.detail_url,
            listing.download_url,
            detail_fetched_at_utc,
            detail_fetched_at_utc,
            listing.detail_url,
            json.dumps(revision.metadata, default=str),
        ),
    )
    return max(0, cursor.rowcount)


def _insert_notice_detail(
    *,
    cursor: Any,
    listing: NoticeListing,
    detail: ParsedDetail,
    revision: NoticeRevision,
    detail_fetched_at_utc: datetime,
) -> int:
    cursor.execute(
        """
        INSERT INTO gas_ebbs.notice_details (
            source_family,
            pipeline_key,
            source_notice_id,
            source_content_hash,
            detail_content_hash,
            detail_url,
            detail_fetched_at_utc,
            detail_clean_text,
            notice_text,
            detail_metadata,
            supporting_data,
            raw_detail_sha256
        )
        VALUES (
            %s, %s, %s, %s, %s, %s, %s, %s, %s, %s::jsonb, %s::jsonb, %s
        )
        ON CONFLICT (
            source_family,
            pipeline_key,
            source_notice_id,
            source_content_hash
        )
        DO NOTHING;
        """,
        (
            listing.source_family,
            listing.pipeline_key,
            listing.source_notice_id,
            revision.source_content_hash,
            detail.detail_content_hash,
            listing.detail_url,
            detail_fetched_at_utc,
            detail.detail_clean_text,
            detail.notice_text,
            json.dumps(detail.detail_metadata, default=str),
            json.dumps(detail.supporting_data, default=str),
            detail.raw_detail_sha256,
        ),
    )
    return max(0, cursor.rowcount)


def _insert_planned_outages(
    *,
    cursor: Any,
    planned_outages: list[dict[str, Any]],
) -> int:
    if not planned_outages:
        return 0
    columns = [
        "source_family",
        "pipeline_key",
        "source_notice_id",
        "source_content_hash",
        "outage_sequence",
        "classification",
        "confidence",
        "notice_type",
        "subject",
        "effective_start_at_utc",
        "effective_end_at_utc",
        "location_id",
        "location_name",
        "zone",
        "delivery_receipt",
        "tsb_type",
        "available_capacity_mdt_per_day",
        "highest_priority_included",
        "flow_direction",
        "job_number",
        "source_table_title",
        "source_row_json",
        "derived_at_utc",
    ]
    rows = [
        tuple(
            Json(row[column], dumps=lambda value: json.dumps(value, default=str))
            if column == "source_row_json"
            else row[column]
            for column in columns
        )
        for row in planned_outages
    ]
    query = """
        INSERT INTO gas_ebbs.planned_outages (
            source_family,
            pipeline_key,
            source_notice_id,
            source_content_hash,
            outage_sequence,
            classification,
            confidence,
            notice_type,
            subject,
            effective_start_at_utc,
            effective_end_at_utc,
            location_id,
            location_name,
            zone,
            delivery_receipt,
            tsb_type,
            available_capacity_mdt_per_day,
            highest_priority_included,
            flow_direction,
            job_number,
            source_table_title,
            source_row_json,
            derived_at_utc
        )
        VALUES %s
        ON CONFLICT (
            source_family,
            pipeline_key,
            source_notice_id,
            source_content_hash,
            outage_sequence
        )
        DO NOTHING;
    """
    execute_values(cursor, query, rows, page_size=1000)
    return max(0, cursor.rowcount)


def _update_notice_detail_success(
    *,
    cursor: Any,
    listing: NoticeListing,
    detail: ParsedDetail,
    revision: NoticeRevision,
    detail_fetched_at_utc: datetime,
) -> None:
    cursor.execute(
        """
        UPDATE gas_ebbs.notices
        SET
            latest_source_content_hash = %s,
            latest_detail_content_hash = %s,
            notice_status_desc = %s,
            prior_notice_id = %s,
            last_detail_fetched_at_utc = %s,
            last_detail_error_at_utc = NULL,
            last_detail_error_message = NULL,
            updated_at = NOW()
        WHERE source_family = %s
          AND pipeline_key = %s
          AND source_notice_id = %s;
        """,
        (
            revision.source_content_hash,
            detail.detail_content_hash,
            detail.detail_metadata.get("notice_stat_desc"),
            detail.detail_metadata.get("prior_notice"),
            detail_fetched_at_utc,
            listing.source_family,
            listing.pipeline_key,
            listing.source_notice_id,
        ),
    )


def _extract_detail_metadata(html_text: str) -> dict[str, str]:
    tables = _parse_html_tables(html_text)
    metadata: dict[str, str] = {}
    if not tables:
        return metadata
    for row in tables[0]:
        if len(row) != 2:
            continue
        key = row[0].strip().rstrip(":")
        value = _clean_text(row[1])
        if key:
            metadata[_normalize_header(key)] = value
    return metadata


def _extract_notice_text(clean_text: str) -> str:
    marker = "Notice Text:"
    if marker not in clean_text:
        return clean_text
    notice_text = clean_text.split(marker, 1)[1].strip()
    return _clean_multiline_text(notice_text)


def _extract_supporting_tables(html_text: str) -> list[dict[str, Any]]:
    tables = _parse_html_tables(html_text)
    structured: list[dict[str, Any]] = []
    for table in tables:
        for index, row in enumerate(table):
            headers = [_normalize_header(value) for value in row]
            if not headers or len(set(headers)) != len(headers):
                continue
            if not any(header in {"loc_id", "location_name", "job"} for header in headers):
                continue
            title = None
            if index > 0 and len(table[index - 1]) == 1:
                title = table[index - 1][0]
            rows: list[dict[str, str]] = []
            for raw_row in table[index + 1 :]:
                if len(raw_row) != len(headers):
                    continue
                parsed_row = {
                    header: _clean_text(value)
                    for header, value in zip(headers, raw_row)
                    if header
                }
                if any(parsed_row.values()):
                    rows.append(parsed_row)
            if rows:
                structured.append(
                    {
                        "title": title,
                        "headers": headers,
                        "rows": rows,
                    }
                )
            break
    return structured


def _parse_html_tables(html_text: str) -> list[list[list[str]]]:
    parser = _TableParser()
    parser.feed(html_text)
    parser.close()
    return parser.tables


def _is_outage_candidate(listing: NoticeListing, detail: ParsedDetail) -> bool:
    text = " ".join(
        [
            listing.notice_type or "",
            listing.subject or "",
            detail.notice_text[:1000],
        ]
    ).lower()
    return any(token in text for token in ("maint", "maintenance", "outage", "constraint"))


def _has_planned_outage_headers(headers: list[str]) -> bool:
    header_set = set(headers)
    return (
        {"loc_id", "location_name"}.issubset(header_set)
        and ("job" in header_set or "job_number" in header_set)
        and (
            "available_capacity_mdt_d" in header_set
            or "available_capacity" in header_set
        )
    )


def _first_value(row: dict[str, str], *keys: str) -> str | None:
    for key in keys:
        value = _none_if_blank(row.get(key))
        if value is not None:
            return value
    return None


def _parse_number(value: str | None) -> float | None:
    value = _none_if_blank(value)
    if value is None:
        return None
    cleaned = value.replace(",", "")
    match = re.search(r"-?\d+(?:\.\d+)?", cleaned)
    return float(match.group(0)) if match else None


def _has_explicit_no_records_marker(html_text: str) -> bool:
    text = html_to_text(html_text).lower()
    return any(
        marker in text
        for marker in (
            "no records found",
            "no records to display",
            "no notices found",
            "no data available",
        )
    )


def _extract_detail_url(cell: "_Cell", source_notice_id: str) -> str:
    for link in cell.links:
        onclick = link.get("onclick") or ""
        match = _DETAIL_ONCLICK_RE.search(onclick)
        if match:
            return urljoin(BASE_URL, match.group(1).replace("&amp;", "&"))
    return build_detail_url(source_notice_id)


def _extract_download_url(cell: "_Cell") -> str | None:
    for link in cell.links:
        href = link.get("href")
        if href and href != "#":
            return urljoin(BASE_URL, href.replace("&amp;", "&"))
    return None


def _detail_notice_id(detail_url: str) -> str | None:
    parsed = urlsplit(detail_url)
    query = parse_qs(parsed.query)
    values = query.get("delvid")
    return values[0] if values else None


def _hash_payload(payload: Any) -> str:
    canonical = json.dumps(payload, sort_keys=True, separators=(",", ":"), default=str)
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def _sha256_text(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def _none_if_blank(value: str | None) -> str | None:
    cleaned = _clean_text(value or "")
    return cleaned or None


def _clean_text(value: str) -> str:
    return _SPACE_RE.sub(" ", value).strip()


def _clean_multiline_text(value: str) -> str:
    lines = [_clean_text(line) for line in value.splitlines()]
    collapsed: list[str] = []
    previous_blank = False
    for line in lines:
        if not line:
            if not previous_blank and collapsed:
                collapsed.append("")
            previous_blank = True
            continue
        collapsed.append(line)
        previous_blank = False
    return "\n".join(collapsed).strip()


def _normalize_header(value: str) -> str:
    normalized = _HEADER_RE.sub("_", value.strip().lower()).strip("_")
    aliases = {
        "loc_id": "loc_id",
        "loc": "loc_id",
        "location": "location_name",
        "location_name": "location_name",
        "zn": "zn",
        "zone": "zone",
        "del_rec": "del_rec",
        "del_receipt": "del_rec",
        "receipt_delivery": "del_rec",
        "type_of_tsb": "type_of_tsb",
        "available_capacity_mdt_d": "available_capacity_mdt_d",
        "available_capacity_mdt_per_d": "available_capacity_mdt_d",
        "available_capacity": "available_capacity",
        "highest_priority_included": "highest_priority_included",
        "flow_dir": "flow_dir",
        "flow_direction": "flow_direction",
        "job": "job",
        "job_": "job",
        "job_number": "job_number",
    }
    return aliases.get(normalized, normalized)


@dataclass
class _Cell:
    text: str
    links: list[dict[str, str | None]]


class _ListingTableParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.found_notice_table = False
        self._in_tbody = False
        self._in_row = False
        self._in_cell = False
        self._cell_parts: list[str] = []
        self._cell_links: list[dict[str, str | None]] = []
        self._row: list[_Cell] = []
        self.rows: list[list[_Cell]] = []

    def handle_starttag(
        self,
        tag: str,
        attrs: list[tuple[str, str | None]],
    ) -> None:
        attrs_dict = dict(attrs)
        if tag == "tbody" and "ui-datatable-data" in (attrs_dict.get("class") or ""):
            self.found_notice_table = True
            self._in_tbody = True
        elif self._in_tbody and tag == "tr":
            self._in_row = True
            self._row = []
        elif self._in_row and tag == "td":
            self._in_cell = True
            self._cell_parts = []
            self._cell_links = []
        elif self._in_cell and tag == "a":
            self._cell_links.append(
                {
                    "href": attrs_dict.get("href"),
                    "onclick": attrs_dict.get("onclick"),
                }
            )

    def handle_endtag(self, tag: str) -> None:
        if self._in_cell and tag == "td":
            self._row.append(
                _Cell(
                    text=_clean_text(" ".join(self._cell_parts)),
                    links=list(self._cell_links),
                )
            )
            self._in_cell = False
        elif self._in_row and tag == "tr":
            self.rows.append(list(self._row))
            self._in_row = False
        elif self._in_tbody and tag == "tbody":
            self._in_tbody = False

    def handle_data(self, data: str) -> None:
        if self._in_cell:
            self._cell_parts.append(data)


class _TextParser(HTMLParser):
    _NEWLINE_TAGS = {"br", "p", "div", "tr", "table", "hr", "h1", "h2", "h3"}
    _SPACE_TAGS = {"td", "th", "span", "b", "strong", "font"}

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.parts: list[str] = []
        self._skip_depth = 0

    def handle_starttag(
        self,
        tag: str,
        attrs: list[tuple[str, str | None]],
    ) -> None:
        if tag in {"script", "style"}:
            self._skip_depth += 1
            return
        if self._skip_depth:
            return
        if tag in self._NEWLINE_TAGS:
            self.parts.append("\n")
        elif tag in self._SPACE_TAGS:
            self.parts.append(" ")

    def handle_endtag(self, tag: str) -> None:
        if tag in {"script", "style"} and self._skip_depth:
            self._skip_depth -= 1
            return
        if self._skip_depth:
            return
        if tag in self._NEWLINE_TAGS:
            self.parts.append("\n")
        elif tag in self._SPACE_TAGS:
            self.parts.append(" ")

    def handle_data(self, data: str) -> None:
        if not self._skip_depth:
            self.parts.append(data)


class _TableParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.tables: list[list[list[str]]] = []
        self._table_depth = 0
        self._current_table: list[list[str]] | None = None
        self._current_row: list[str] | None = None
        self._in_cell = False
        self._cell_parts: list[str] = []

    def handle_starttag(
        self,
        tag: str,
        attrs: list[tuple[str, str | None]],
    ) -> None:
        if tag == "table":
            self._table_depth += 1
            if self._table_depth == 1:
                self._current_table = []
        elif self._table_depth >= 1 and tag == "tr":
            self._current_row = []
        elif self._table_depth >= 1 and tag in {"td", "th"}:
            self._in_cell = True
            self._cell_parts = []
        elif self._in_cell and tag == "br":
            self._cell_parts.append("\n")

    def handle_endtag(self, tag: str) -> None:
        if self._in_cell and tag in {"td", "th"}:
            if self._current_row is not None:
                self._current_row.append(_clean_multiline_text("".join(self._cell_parts)))
            self._in_cell = False
        elif self._table_depth >= 1 and tag == "tr":
            if self._current_table is not None and self._current_row:
                self._current_table.append(list(self._current_row))
            self._current_row = None
        elif tag == "table" and self._table_depth >= 1:
            if self._table_depth == 1 and self._current_table is not None:
                self.tables.append(list(self._current_table))
                self._current_table = None
            self._table_depth -= 1

    def handle_data(self, data: str) -> None:
        if self._in_cell:
            self._cell_parts.append(data)
