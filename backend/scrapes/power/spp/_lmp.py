"""Shared SPP Portal LMP fetching and normalization.

Source contract:
- Source system: SPP Portal file-browser API.
- DA endpoint: da-lmp-by-settlement-location daily CSV files.
- RT endpoint: rtbm-lmp-by-location five-minute interval CSV files.
- Primary grain: operating date x interval start UTC x settlement location x market.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, timedelta
from io import StringIO
import logging
import time
from typing import Callable
from urllib.parse import urlsplit

import pandas as pd
import requests

from backend.utils import db
from backend.utils.ops_logging import log_api_fetch, redact_secrets


BASE_URL = "https://portal.spp.org/file-browser-api/download"
DA_ENDPOINT = f"{BASE_URL}/da-lmp-by-settlement-location"
RT_ENDPOINT = f"{BASE_URL}/rtbm-lmp-by-location"
SOURCE_VERSION = "spp_portal_file_browser_v1"
LOCAL_MARKET_TIMEZONE = "America/Chicago"
DEFAULT_HUB_NODES = ("SPPNORTH_HUB", "SPPSOUTH_HUB")

DEFAULT_TIMEOUT_SECONDS = 60
DEFAULT_MAX_ATTEMPTS = 3
DEFAULT_RETRY_DELAY_SECONDS = 5.0

PRIMARY_KEY = ["interval_start_time_utc", "node_id", "market_run_id"]
TARGET_COLUMNS = [
    "interval_start_time_utc",
    "interval_end_time_utc",
    "operating_date",
    "operating_hour",
    "operating_interval",
    "node_id",
    "node",
    "market_run_id",
    "price_status",
    "time_resolution",
    "locational_marginal_price",
    "energy_component",
    "congestion_component",
    "loss_component",
    "source_endpoint",
    "source_version",
]
TARGET_DATA_TYPES = [
    "TIMESTAMPTZ",
    "TIMESTAMPTZ",
    "DATE",
    "INTEGER",
    "INTEGER",
    "VARCHAR",
    "VARCHAR",
    "VARCHAR",
    "VARCHAR",
    "VARCHAR",
    "FLOAT",
    "FLOAT",
    "FLOAT",
    "FLOAT",
    "VARCHAR",
    "VARCHAR",
]

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class PortalCsvResult:
    """Decoded SPP Portal CSV response plus the requested portal path."""

    df: pd.DataFrame
    endpoint_url: str
    portal_path: str
    http_status: int


class SPPPortalError(RuntimeError):
    """Raised when an SPP Portal request fails."""

    def __init__(self, message: str, *, status_code: int | None = None) -> None:
        super().__init__(message)
        self.status_code = status_code


class SPPPortalDataNotAvailable(SPPPortalError):
    """Raised when SPP has not published the requested Portal file yet."""


CsvFetcher = Callable[..., PortalCsvResult]


def pull_lmps(
    *,
    operating_date,
    market_run_id: str,
    price_status: str,
    time_resolution: str,
    pipeline_name: str,
    target_table: str,
    endpoint_url: str,
    portal_paths: tuple[str, ...],
    nodes: list[str] | tuple[str, ...] | None = None,
    run_id: str | None = None,
    database: str | None = None,
    metadata: dict | None = None,
    log_fetch: bool = True,
    csv_fetcher: CsvFetcher | None = None,
) -> pd.DataFrame:
    """Pull one SPP LMP market day from one or more Portal CSV files."""
    business_date = coerce_operating_date(operating_date)
    selected_nodes = tuple(nodes or DEFAULT_HUB_NODES)
    fetcher = csv_fetcher or fetch_portal_csv
    started = time.perf_counter()
    frames: list[pd.DataFrame] = []
    files_fetched = 0
    last_status: int | None = None

    try:
        for portal_path in portal_paths:
            result = fetcher(
                endpoint_url=endpoint_url,
                portal_path=portal_path,
                timeout_seconds=DEFAULT_TIMEOUT_SECONDS,
                max_attempts=DEFAULT_MAX_ATTEMPTS,
                retry_delay_seconds=DEFAULT_RETRY_DELAY_SECONDS,
            )
            last_status = result.http_status
            files_fetched += 1
            frames.append(result.df)

        raw_df = pd.concat(frames, ignore_index=True) if frames else pd.DataFrame()
        df = format_lmp_rows(
            raw_df,
            operating_date=business_date,
            source_endpoint=endpoint_url,
            market_run_id=market_run_id,
            price_status=price_status,
            time_resolution=time_resolution,
            nodes=selected_nodes,
        )
    except Exception as exc:
        if log_fetch:
            _log_pull_result(
                endpoint_url=endpoint_url,
                pipeline_name=pipeline_name,
                run_id=run_id,
                target_table=target_table,
                database=database,
                metadata=metadata,
                status="failure",
                elapsed_seconds=time.perf_counter() - started,
                rows_returned=None,
                files_expected=len(portal_paths),
                files_fetched=files_fetched,
                operating_date=business_date,
                http_status=getattr(exc, "status_code", last_status),
                error_type=type(exc).__name__,
                error_message=str(exc),
            )
        raise

    if log_fetch:
        _log_pull_result(
            endpoint_url=endpoint_url,
            pipeline_name=pipeline_name,
            run_id=run_id,
            target_table=target_table,
            database=database,
            metadata=metadata,
            status="success",
            elapsed_seconds=time.perf_counter() - started,
            rows_returned=len(df),
            files_expected=len(portal_paths),
            files_fetched=files_fetched,
            operating_date=business_date,
            http_status=last_status or 200,
        )

    return df


def fetch_portal_csv(
    *,
    endpoint_url: str,
    portal_path: str,
    timeout_seconds: int = DEFAULT_TIMEOUT_SECONDS,
    max_attempts: int = DEFAULT_MAX_ATTEMPTS,
    retry_delay_seconds: float = DEFAULT_RETRY_DELAY_SECONDS,
) -> PortalCsvResult:
    """Fetch one SPP Portal CSV path with bounded retries."""
    if max_attempts < 1:
        raise ValueError("max_attempts must be at least 1")

    response: requests.Response | None = None
    for attempt in range(1, max_attempts + 1):
        try:
            response = requests.get(
                endpoint_url,
                params={"path": portal_path},
                timeout=timeout_seconds,
            )
        except requests.RequestException as exc:
            if attempt == max_attempts:
                raise SPPPortalError(
                    f"SPP Portal request failed for {portal_path}: "
                    f"{redact_secrets(str(exc))}"
                ) from exc
            time.sleep(retry_delay_seconds)
            continue

        if 200 <= response.status_code < 300:
            return PortalCsvResult(
                df=_parse_csv_response(response.text, portal_path=portal_path),
                endpoint_url=endpoint_url,
                portal_path=portal_path,
                http_status=response.status_code,
            )

        message = _http_error_message(response=response, portal_path=portal_path)
        if response.status_code == 404:
            raise SPPPortalDataNotAvailable(
                message,
                status_code=response.status_code,
            )
        if response.status_code not in {429, 500, 502, 503, 504}:
            raise SPPPortalError(message, status_code=response.status_code)
        if attempt == max_attempts:
            raise SPPPortalError(message, status_code=response.status_code)
        time.sleep(_retry_delay(response, retry_delay_seconds))

    raise SPPPortalError(f"SPP Portal request exhausted attempts for {portal_path}")


def format_lmp_rows(
    df: pd.DataFrame,
    *,
    operating_date,
    source_endpoint: str,
    market_run_id: str,
    price_status: str,
    time_resolution: str,
    nodes: list[str] | tuple[str, ...] | None = None,
    source_version: str = SOURCE_VERSION,
) -> pd.DataFrame:
    """Normalize SPP Portal CSV rows into the shared LMP component schema."""
    if df.empty:
        return pd.DataFrame(columns=TARGET_COLUMNS)

    business_date = coerce_operating_date(operating_date)
    selected_nodes = set(nodes or DEFAULT_HUB_NODES)
    current = df.copy()
    current.columns = [_normalize_column_name(column) for column in current.columns]
    _require_columns(
        current,
        [
            "gmtintervalend",
            "settlement_location",
            "pnode",
            "lmp",
            "mlc",
            "mcc",
            "mec",
        ],
    )

    current["node_id"] = current["settlement_location"].astype(str).str.strip()
    current = current.loc[current["node_id"].isin(selected_nodes)].copy()
    if current.empty:
        return pd.DataFrame(columns=TARGET_COLUMNS)

    current["node"] = current["pnode"].astype(str).str.strip()
    current["interval_end_time_utc"] = pd.to_datetime(
        current["gmtintervalend"],
        utc=True,
        errors="raise",
    )
    interval_minutes = _interval_minutes_from_resolution(time_resolution)
    current["interval_start_time_utc"] = (
        current["interval_end_time_utc"] - pd.Timedelta(minutes=interval_minutes)
    )
    current["operating_date"] = business_date
    current["operating_hour"] = current["interval_end_time_utc"].map(
        lambda timestamp: operating_hour_from_interval_end(
            timestamp,
            business_date=business_date,
        )
    )
    current["operating_interval"] = current["interval_end_time_utc"].map(
        lambda timestamp: operating_interval_from_interval_end(
            timestamp,
            interval_minutes=interval_minutes,
        )
    )
    current["market_run_id"] = market_run_id
    current["price_status"] = price_status
    current["time_resolution"] = time_resolution
    current["locational_marginal_price"] = pd.to_numeric(
        current["lmp"],
        errors="coerce",
    )
    current["energy_component"] = pd.to_numeric(current["mec"], errors="coerce")
    current["congestion_component"] = pd.to_numeric(current["mcc"], errors="coerce")
    current["loss_component"] = pd.to_numeric(current["mlc"], errors="coerce")
    current["source_endpoint"] = source_endpoint
    current["source_version"] = source_version

    for column in [
        "node_id",
        "node",
        "market_run_id",
        "price_status",
        "time_resolution",
        "source_endpoint",
        "source_version",
    ]:
        current[column] = current[column].astype(str).str.strip()

    current["operating_date"] = pd.to_datetime(current["operating_date"]).dt.date
    current["operating_hour"] = pd.to_numeric(
        current["operating_hour"],
        errors="coerce",
    ).astype("Int64")
    current["operating_interval"] = pd.to_numeric(
        current["operating_interval"],
        errors="coerce",
    ).astype("Int64")
    current.dropna(subset=PRIMARY_KEY, inplace=True)
    current.drop_duplicates(subset=PRIMARY_KEY, keep="last", inplace=True)
    current.sort_values(PRIMARY_KEY, inplace=True)
    current.reset_index(drop=True, inplace=True)
    return current[TARGET_COLUMNS]


def upsert_lmps(
    *,
    df: pd.DataFrame,
    schema: str,
    table_name: str,
    database: str | None = None,
    primary_key: list[str] | None = None,
) -> None:
    """Upsert normalized SPP LMP rows into a pre-created target table."""
    if df.empty:
        return

    key_columns = primary_key or PRIMARY_KEY
    missing_keys = [column for column in key_columns if column not in df.columns]
    if missing_keys:
        raise ValueError(
            f"Missing primary key columns for {schema}.{table_name}: {missing_keys}"
        )

    db.upsert_dataframe(
        database=database,
        schema=schema,
        table_name=table_name,
        df=df[TARGET_COLUMNS],
        columns=TARGET_COLUMNS,
        data_types=TARGET_DATA_TYPES,
        primary_key=key_columns,
    )


def da_portal_path(operating_date) -> str:
    business_date = coerce_operating_date(operating_date)
    return (
        f"/{business_date:%Y/%m}/By_Day/"
        f"DA-LMP-SL-{business_date:%Y%m%d}0100.csv"
    )


def rt_interval_portal_path(interval_end_time_utc: pd.Timestamp) -> str:
    interval_end_utc = pd.Timestamp(interval_end_time_utc)
    if interval_end_utc.tzinfo is None:
        interval_end_utc = interval_end_utc.tz_localize("UTC")
    else:
        interval_end_utc = interval_end_utc.tz_convert("UTC")
    interval_start_local = (
        interval_end_utc - pd.Timedelta(minutes=5)
    ).tz_convert(LOCAL_MARKET_TIMEZONE)
    interval_end_local = interval_end_utc.tz_convert(LOCAL_MARKET_TIMEZONE)
    stamp = interval_end_local.strftime("%Y%m%d%H%M")
    if getattr(interval_end_local.to_pydatetime(), "fold", 0) == 1:
        stamp = f"{stamp}d"
    return (
        f"/{interval_start_local:%Y/%m}/By_Interval/"
        f"{interval_start_local:%d}/RTBM-LMP-SL-{stamp}.csv"
    )


def rt_portal_paths_for_day(operating_date) -> tuple[str, ...]:
    return tuple(
        rt_interval_portal_path(interval_end)
        for interval_end in interval_end_times_utc(
            operating_date,
            interval_minutes=5,
        )
    )


def rt_final_interval_portal_path(operating_date) -> str:
    interval_ends = interval_end_times_utc(operating_date, interval_minutes=5)
    if not interval_ends:
        raise ValueError("No RT interval ends resolved")
    return rt_interval_portal_path(interval_ends[-1])


def interval_end_times_utc(
    operating_date,
    *,
    interval_minutes: int,
) -> tuple[pd.Timestamp, ...]:
    start_utc, end_utc = market_day_window_utc(operating_date)
    interval = pd.Timedelta(minutes=interval_minutes)
    cursor = start_utc + interval
    values: list[pd.Timestamp] = []
    while cursor <= end_utc:
        values.append(cursor)
        cursor += interval
    return tuple(values)


def market_day_window_utc(operating_date) -> tuple[pd.Timestamp, pd.Timestamp]:
    business_date = coerce_operating_date(operating_date)
    start_local = pd.Timestamp(business_date).tz_localize(LOCAL_MARKET_TIMEZONE)
    end_local = pd.Timestamp(business_date + timedelta(days=1)).tz_localize(
        LOCAL_MARKET_TIMEZONE
    )
    return start_local.tz_convert("UTC"), end_local.tz_convert("UTC")


def operating_hour_from_interval_end(
    interval_end_time_utc,
    *,
    business_date,
) -> int:
    local_end = pd.Timestamp(interval_end_time_utc).tz_convert(LOCAL_MARKET_TIMEZONE)
    market_date = coerce_operating_date(business_date)
    if (
        local_end.date() == market_date + timedelta(days=1)
        and local_end.hour == 0
        and local_end.minute == 0
    ):
        return 24
    if local_end.minute == 0 and local_end.second == 0:
        return int(local_end.hour)
    return int(local_end.hour) + 1


def operating_interval_from_interval_end(
    interval_end_time_utc,
    *,
    interval_minutes: int,
) -> int:
    if interval_minutes >= 60:
        return 0
    local_end = pd.Timestamp(interval_end_time_utc).tz_convert(LOCAL_MARKET_TIMEZONE)
    intervals_per_hour = int(timedelta(hours=1) / timedelta(minutes=interval_minutes))
    if local_end.minute == 0 and local_end.second == 0:
        return intervals_per_hour
    return int(local_end.minute / interval_minutes)


def coerce_operating_date(value) -> date:
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    return pd.Timestamp(value).date()


def utc_timestamp(value) -> datetime:
    timestamp = pd.Timestamp(value)
    if timestamp.tzinfo is None:
        timestamp = timestamp.tz_localize("UTC")
    else:
        timestamp = timestamp.tz_convert("UTC")
    return timestamp.to_pydatetime()


def _parse_csv_response(text: str, *, portal_path: str) -> pd.DataFrame:
    try:
        return pd.read_csv(StringIO(text))
    except Exception as exc:
        raise SPPPortalError(
            f"SPP Portal CSV parse failed for {portal_path}: {exc}",
        ) from exc


def _normalize_column_name(column: object) -> str:
    return (
        str(column)
        .strip()
        .lower()
        .replace(" ", "_")
        .replace("-", "_")
        .replace("/", "_")
    )


def _require_columns(df: pd.DataFrame, columns: list[str]) -> None:
    missing = [column for column in columns if column not in df.columns]
    if missing:
        raise ValueError(f"SPP Portal LMP response missing columns: {missing}")


def _interval_minutes_from_resolution(time_resolution: str) -> int:
    normalized = str(time_resolution).strip().lower()
    if normalized == "hourly":
        return 60
    if normalized == "five_minute":
        return 5
    raise ValueError(f"Unsupported SPP LMP time resolution: {time_resolution}")


def _http_error_message(*, response: requests.Response, portal_path: str) -> str:
    detail = response.text[:500]
    return redact_secrets(
        f"SPP Portal HTTP {response.status_code} for {portal_path}: {detail}"
    )


def _retry_delay(response: requests.Response, fallback_seconds: float) -> float:
    value = response.headers.get("Retry-After")
    if value is None:
        return fallback_seconds
    try:
        return max(0.0, float(value))
    except ValueError:
        return fallback_seconds


def _log_pull_result(
    *,
    endpoint_url: str,
    pipeline_name: str,
    run_id: str | None,
    target_table: str,
    database: str | None,
    metadata: dict | None,
    status: str,
    elapsed_seconds: float,
    rows_returned: int | None,
    files_expected: int,
    files_fetched: int,
    operating_date: date,
    http_status: int | None,
    error_type: str | None = None,
    error_message: str | None = None,
) -> None:
    parsed_url = urlsplit(endpoint_url)
    log_api_fetch(
        actor_type="scrape",
        provider="spp",
        pipeline_name=pipeline_name,
        run_id=run_id,
        operation_name=pipeline_name,
        feed_name=pipeline_name,
        target_table=target_table,
        method="GET",
        target_host=parsed_url.netloc,
        target_path=parsed_url.path,
        status=status,
        http_status=http_status,
        attempt=1,
        max_attempts=1,
        elapsed_ms=round(elapsed_seconds * 1000),
        rows_returned=rows_returned,
        error_type=error_type,
        error_message=redact_secrets(error_message),
        metadata={
            **(metadata or {}),
            "api_family": "spp_portal_file_browser",
            "operating_date": operating_date.isoformat(),
            "files_expected": files_expected,
            "files_fetched": files_fetched,
        },
        database=database,
    )
