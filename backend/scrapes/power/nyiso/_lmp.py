"""Shared NYISO MIS LBMP fetching and normalization.

Source contract:
- Source system: NYISO public MIS CSV.
- DA endpoint: damlbmp daily zonal CSV files.
- RT endpoint: realtime daily zonal CSV files.
- Primary grain: operating date x interval start UTC x node/PTID x market.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, timedelta
from io import StringIO
import logging
import re
import time
from typing import Callable
from urllib.parse import urlsplit

import pandas as pd
import requests

from backend.utils import db
from backend.utils.ops_logging import log_api_fetch, redact_secrets


BASE_URL = "https://mis.nyiso.com/public"
DA_ENDPOINT = f"{BASE_URL}/csv/damlbmp"
RT_ENDPOINT = f"{BASE_URL}/csv/realtime"
DA_INDEX_URL = f"{BASE_URL}/P-2Alist.htm"
RT_INDEX_URL = f"{BASE_URL}/P-24Alist.htm"
SOURCE_VERSION = "nyiso_mis_csv_v1"
LOCAL_MARKET_TIMEZONE = "America/New_York"
DEFAULT_LOAD_ZONE_NODES = (
    "WEST",
    "GENESE",
    "CENTRL",
    "NORTH",
    "MHK VL",
    "CAPITL",
    "HUD VL",
    "MILLWD",
    "DUNWOD",
    "N.Y.C.",
    "LONGIL",
)
DEFAULT_PJM_INTERFACE_NODES = ("PJM",)
DEFAULT_DA_NODES = DEFAULT_LOAD_ZONE_NODES + DEFAULT_PJM_INTERFACE_NODES

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
    "ptid",
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
class MISCsvResult:
    """Decoded NYISO MIS CSV response plus the requested URL."""

    df: pd.DataFrame
    endpoint_url: str
    http_status: int


class NYISOMISError(RuntimeError):
    """Raised when a NYISO MIS request fails."""

    def __init__(self, message: str, *, status_code: int | None = None) -> None:
        super().__init__(message)
        self.status_code = status_code


class NYISOMISDataNotAvailable(NYISOMISError):
    """Raised when NYISO has not published the requested MIS CSV yet."""


CsvFetcher = Callable[..., MISCsvResult]


def pull_lmps(
    *,
    operating_date,
    market_run_id: str,
    price_status: str,
    time_resolution: str,
    pipeline_name: str,
    target_table: str,
    endpoint_url: str,
    nodes: list[str] | tuple[str, ...] | None = None,
    run_id: str | None = None,
    database: str | None = None,
    metadata: dict | None = None,
    log_fetch: bool = True,
    csv_fetcher: CsvFetcher | None = None,
) -> pd.DataFrame:
    """Pull one NYISO MIS zonal LBMP market day from a daily CSV file."""
    business_date = coerce_operating_date(operating_date)
    selected_nodes = tuple(nodes or DEFAULT_LOAD_ZONE_NODES)
    fetcher = csv_fetcher or fetch_mis_csv
    started = time.perf_counter()
    files_fetched = 0
    last_status: int | None = None

    try:
        result = fetcher(
            endpoint_url=endpoint_url,
            timeout_seconds=DEFAULT_TIMEOUT_SECONDS,
            max_attempts=DEFAULT_MAX_ATTEMPTS,
            retry_delay_seconds=DEFAULT_RETRY_DELAY_SECONDS,
        )
        last_status = result.http_status
        files_fetched = 1
        df = format_lmp_rows(
            result.df,
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
                files_expected=1,
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
            files_expected=1,
            files_fetched=files_fetched,
            operating_date=business_date,
            http_status=last_status or 200,
        )

    return df


def fetch_mis_csv(
    *,
    endpoint_url: str,
    timeout_seconds: int = DEFAULT_TIMEOUT_SECONDS,
    max_attempts: int = DEFAULT_MAX_ATTEMPTS,
    retry_delay_seconds: float = DEFAULT_RETRY_DELAY_SECONDS,
) -> MISCsvResult:
    """Fetch one public NYISO MIS CSV with bounded retries."""
    if max_attempts < 1:
        raise ValueError("max_attempts must be at least 1")

    response: requests.Response | None = None
    for attempt in range(1, max_attempts + 1):
        try:
            response = requests.get(endpoint_url, timeout=timeout_seconds)
        except requests.RequestException as exc:
            if attempt == max_attempts:
                raise NYISOMISError(
                    "NYISO MIS request failed for "
                    f"{endpoint_url}: {redact_secrets(str(exc))}"
                ) from exc
            time.sleep(retry_delay_seconds)
            continue

        if 200 <= response.status_code < 300:
            return MISCsvResult(
                df=_parse_csv_response(response.text, endpoint_url=endpoint_url),
                endpoint_url=endpoint_url,
                http_status=response.status_code,
            )

        message = _http_error_message(response=response, endpoint_url=endpoint_url)
        if response.status_code == 404:
            raise NYISOMISDataNotAvailable(message, status_code=response.status_code)
        if response.status_code not in {429, 500, 502, 503, 504}:
            raise NYISOMISError(message, status_code=response.status_code)
        if attempt == max_attempts:
            raise NYISOMISError(message, status_code=response.status_code)
        time.sleep(_retry_delay(response, retry_delay_seconds))

    raise NYISOMISError(f"NYISO MIS request exhausted attempts for {endpoint_url}")


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
    """Normalize NYISO MIS zonal LBMP rows into the shared LMP schema."""
    if df.empty:
        return pd.DataFrame(columns=TARGET_COLUMNS)

    business_date = coerce_operating_date(operating_date)
    selected_nodes = set(nodes or DEFAULT_LOAD_ZONE_NODES)
    interval_minutes = _interval_minutes_from_resolution(time_resolution)
    start_utc, _end_utc = market_day_window_utc(business_date)
    current = df.copy()
    current.columns = [_normalize_column_name(column) for column in current.columns]
    _require_columns(
        current,
        [
            "time_stamp",
            "name",
            "ptid",
            "lbmp_mwhr",
            "marginal_cost_losses_mwhr",
            "marginal_cost_congestion_mwhr",
        ],
    )

    current["_source_row_number"] = range(len(current))
    current["node_id"] = current["name"].astype(str).str.strip()
    current = current.loc[current["node_id"].isin(selected_nodes)].copy()
    if current.empty:
        return pd.DataFrame(columns=TARGET_COLUMNS)

    current["source_timestamp"] = pd.to_datetime(
        current["time_stamp"],
        errors="raise",
    )
    current = _filter_market_day_timestamps(
        current,
        business_date=business_date,
        interval_minutes=interval_minutes,
    )
    if current.empty:
        return pd.DataFrame(columns=TARGET_COLUMNS)

    current.sort_values(
        ["node_id", "source_timestamp", "_source_row_number"],
        inplace=True,
    )
    current["period_index"] = current.groupby("node_id").cumcount()
    current["interval_start_time_utc"] = current["period_index"].map(
        lambda index: start_utc + pd.Timedelta(minutes=interval_minutes * int(index))
    )
    current["interval_end_time_utc"] = (
        current["interval_start_time_utc"] + pd.Timedelta(minutes=interval_minutes)
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
    current["ptid"] = pd.to_numeric(current["ptid"], errors="coerce").astype("Int64")
    current["node"] = current["node_id"]
    current["market_run_id"] = market_run_id
    current["price_status"] = price_status
    current["time_resolution"] = time_resolution
    current["locational_marginal_price"] = pd.to_numeric(
        current["lbmp_mwhr"],
        errors="coerce",
    )
    current["loss_component"] = pd.to_numeric(
        current["marginal_cost_losses_mwhr"],
        errors="coerce",
    )
    current["congestion_component"] = pd.to_numeric(
        current["marginal_cost_congestion_mwhr"],
        errors="coerce",
    )
    current["energy_component"] = (
        current["locational_marginal_price"]
        - current["loss_component"]
        - current["congestion_component"]
    )
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
    for column in [
        "locational_marginal_price",
        "energy_component",
        "congestion_component",
        "loss_component",
    ]:
        current[column] = pd.to_numeric(current[column], errors="coerce")

    current.dropna(subset=[*PRIMARY_KEY, "ptid"], inplace=True)
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
    """Upsert normalized NYISO LBMP rows into a pre-created target table."""
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


def da_csv_url(operating_date) -> str:
    business_date = coerce_operating_date(operating_date)
    return f"{DA_ENDPOINT}/{business_date:%Y%m%d}damlbmp_zone.csv"


def rt_csv_url(operating_date) -> str:
    business_date = coerce_operating_date(operating_date)
    return f"{RT_ENDPOINT}/{business_date:%Y%m%d}realtime_zone.csv"


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


def _filter_market_day_timestamps(
    df: pd.DataFrame,
    *,
    business_date: date,
    interval_minutes: int,
) -> pd.DataFrame:
    """Keep only canonical interval labels for the requested NYISO market day."""
    day_start = pd.Timestamp(business_date)
    day_end = day_start + pd.Timedelta(days=1)
    timestamp = df["source_timestamp"]
    canonical_mask = (
        timestamp.dt.second.eq(0)
        & timestamp.dt.microsecond.eq(0)
        & timestamp.dt.nanosecond.eq(0)
    )

    if interval_minutes == 60:
        day_mask = timestamp.ge(day_start) & timestamp.lt(day_end)
        interval_mask = timestamp.dt.minute.eq(0)
    else:
        day_mask = timestamp.gt(day_start) & timestamp.le(day_end)
        interval_mask = timestamp.dt.minute.mod(interval_minutes).eq(0)

    return df.loc[day_mask & canonical_mask & interval_mask].copy()


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


def _parse_csv_response(text: str, *, endpoint_url: str) -> pd.DataFrame:
    try:
        return pd.read_csv(StringIO(text))
    except Exception as exc:
        raise NYISOMISError(
            f"NYISO MIS CSV parse failed for {endpoint_url}: {exc}",
        ) from exc


def _normalize_column_name(column: object) -> str:
    return re.sub(r"[^a-z0-9]+", "_", str(column).strip().lower()).strip("_")


def _require_columns(df: pd.DataFrame, columns: list[str]) -> None:
    missing = [column for column in columns if column not in df.columns]
    if missing:
        raise ValueError(f"NYISO MIS LBMP response missing columns: {missing}")


def _interval_minutes_from_resolution(time_resolution: str) -> int:
    normalized = str(time_resolution).strip().lower()
    if normalized == "hourly":
        return 60
    if normalized == "five_minute":
        return 5
    raise ValueError(f"Unsupported NYISO LBMP time resolution: {time_resolution}")


def _http_error_message(*, response: requests.Response, endpoint_url: str) -> str:
    detail = response.text[:500]
    return redact_secrets(
        f"NYISO MIS HTTP {response.status_code} for {endpoint_url}: {detail}"
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
        provider="nyiso",
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
            "api_family": "nyiso_mis_csv",
            "operating_date": operating_date.isoformat(),
            "files_expected": files_expected,
            "files_fetched": files_fetched,
        },
        database=database,
    )
