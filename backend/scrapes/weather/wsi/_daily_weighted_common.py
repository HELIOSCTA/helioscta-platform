"""Shared helpers for WSI daily weighted forecast scrapes."""

from __future__ import annotations

import re
from datetime import datetime, timezone

import pandas as pd
from psycopg2 import sql

from backend.utils import db

_FORECAST_UPDATED_RE = re.compile(
    r"Forecast Updated (?P<issued>[A-Za-z]{3}\s+\d{1,2}\s+\d{4}\s+\d{4}) UTC",
    re.IGNORECASE,
)


def first_nonempty_line(text: str) -> str:
    for line in text.splitlines():
        stripped = line.strip()
        if stripped:
            return stripped
    raise ValueError("WSI response body is empty.")


def parse_source_issue_at_utc(source_banner: str) -> datetime | None:
    match = _FORECAST_UPDATED_RE.search(source_banner)
    if not match:
        return None
    issued = datetime.strptime(match.group("issued"), "%b %d %Y %H%M")
    return issued.replace(tzinfo=timezone.utc)


def source_issue_key(
    *,
    endpoint_name: str,
    model: str,
    forecast_type: str,
    source_issue_at_utc: datetime | None,
    scrape_run_at_utc: datetime,
) -> str:
    issue_at = source_issue_at_utc
    if issue_at is None:
        issue_at = scrape_run_at_utc.astimezone(timezone.utc).replace(
            minute=0,
            second=0,
            microsecond=0,
        )
    stamp = issue_at.astimezone(timezone.utc).strftime("%Y%m%d%H%M")
    return f"wsi:{endpoint_name}:{model}:{forecast_type}:{stamp}"


def attach_source_context(
    df: pd.DataFrame,
    *,
    source_issue_key: str,
    source_issue_at_utc: datetime | None,
    source_banner: str,
    scrape_run_at_utc: datetime,
) -> pd.DataFrame:
    df.attrs.update(
        {
            "source_issue_key": source_issue_key,
            "source_issue_at_utc": source_issue_at_utc,
            "source_banner": source_banner,
            "scrape_run_at_utc": scrape_run_at_utc,
        }
    )
    return df


def utc_now() -> datetime:
    return datetime.now(tz=timezone.utc).replace(microsecond=0)


def timestamp_or_nat(value: datetime | None) -> pd.Timestamp:
    if value is None:
        return pd.NaT
    return pd.Timestamp(value)


def numeric_value(value: object) -> float | None:
    parsed = pd.to_numeric(pd.Series([value], dtype="object"), errors="coerce").iloc[0]
    if pd.isna(parsed):
        return None
    return float(parsed)


def purge_rows_older_than_source_issue_or_scrape(
    *,
    schema: str,
    table_name: str,
    retention_days: int,
    database: str | None = None,
) -> int:
    if retention_days < 1:
        raise ValueError("retention_days must be >= 1")

    connection = None
    cursor = None
    try:
        connection = db.connect(database=database)
        cursor = connection.cursor()
        query = sql.SQL(
            """
            WITH deleted AS (
                DELETE FROM {}.{}
                WHERE COALESCE(source_issue_at_utc, scrape_run_at_utc)
                    < (NOW() - (%s::int * INTERVAL '1 day'))
                RETURNING 1
            )
            SELECT COUNT(*) AS deleted_rows
            FROM deleted;
            """
        ).format(
            sql.Identifier(schema),
            sql.Identifier(table_name),
        )
        cursor.execute(query, (retention_days,))
        deleted_rows = int(cursor.fetchone()[0])
        connection.commit()
        return deleted_rows
    except Exception:
        if connection:
            connection.rollback()
        raise
    finally:
        if cursor:
            cursor.close()
        if connection:
            connection.close()
