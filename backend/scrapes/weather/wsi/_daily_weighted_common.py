"""Shared helpers for WSI daily weighted forecast scrapes."""

from __future__ import annotations

import re
from datetime import datetime, timezone

import pandas as pd

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
