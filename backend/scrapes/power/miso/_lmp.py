"""Shared MISO Data Exchange LMP normalization."""
from __future__ import annotations

import time
from datetime import date, datetime, timedelta, timezone

import pandas as pd

from backend.scrapes.power.miso import data_exchange_client
from backend.utils import db


SOURCE_VERSION = "pricing_v1"
FIXED_EST_TIMEZONE = timezone(timedelta(hours=-5))
LOCAL_MARKET_TIMEZONE = "Etc/GMT+5"
DEFAULT_HUB_NODES = (
    "INDIANA.HUB",
    "ARKANSAS.HUB",
    "ILLINOIS.HUB",
    "LOUISIANA.HUB",
    "MICHIGAN.HUB",
    "MINN.HUB",
    "TEXAS.HUB",
)
DEFAULT_PJM_INTERFACE_NODES = ("PJMC",)
DEFAULT_DA_NODES = DEFAULT_HUB_NODES + DEFAULT_PJM_INTERFACE_NODES
NODE_FETCH_MAX_ATTEMPTS = 2
NODE_FETCH_RETRY_DELAY_SECONDS = 15.0
RETRYABLE_NODE_STATUS_CODES = {429, 500, 502, 503, 504}

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


def pull_lmps(
    *,
    operating_date,
    endpoint_template: str,
    market_run_id: str,
    price_status: str,
    pipeline_name: str,
    target_table: str,
    nodes: list[str] | tuple[str, ...] | None = None,
    time_resolution: str | None = None,
    subscription_key: str | None = None,
    run_id: str | None = None,
    database: str | None = None,
    metadata: dict | None = None,
    log_fetch: bool = True,
    node_max_attempts: int = NODE_FETCH_MAX_ATTEMPTS,
    node_retry_delay_seconds: float = NODE_FETCH_RETRY_DELAY_SECONDS,
) -> pd.DataFrame:
    """Pull and normalize MISO Data Exchange LMP rows for one operating date."""
    business_date = coerce_operating_date(operating_date)
    selected_nodes = tuple(nodes or DEFAULT_HUB_NODES)
    endpoint = endpoint_template.format(operating_date=business_date.isoformat())
    raw_records: list[dict] = []
    failed_nodes: dict[str, data_exchange_client.MISODataExchangeError] = {}
    pending_nodes = list(selected_nodes)
    max_node_attempts = max(1, int(node_max_attempts))

    for node_attempt in range(1, max_node_attempts + 1):
        next_pending_nodes: list[str] = []
        for node in pending_nodes:
            try:
                raw_records.extend(
                    fetch_lmp_node_records(
                        endpoint=endpoint,
                        business_date=business_date,
                        node=node,
                        price_status=price_status,
                        time_resolution=time_resolution,
                        subscription_key=subscription_key,
                        pipeline_name=pipeline_name,
                        target_table=target_table,
                        run_id=run_id,
                        database=database,
                        metadata=metadata,
                        log_fetch=log_fetch,
                        node_attempt=node_attempt,
                    )
                )
                failed_nodes.pop(node, None)
            except data_exchange_client.MISODataExchangeError as exc:
                failed_nodes[node] = exc
                next_pending_nodes.append(node)

        if not next_pending_nodes:
            break
        if node_attempt < max_node_attempts and node_retry_delay_seconds > 0:
            time.sleep(node_retry_delay_seconds)
        pending_nodes = next_pending_nodes

    if failed_nodes:
        raise_lmp_node_fetch_error(
            failed_nodes=failed_nodes,
            endpoint=endpoint,
            attempts=max_node_attempts,
        )

    return format_lmp_records(
        raw_records,
        operating_date=business_date,
        source_endpoint=endpoint,
        market_run_id=market_run_id,
        price_status=price_status,
        fallback_time_resolution=time_resolution,
    )


def fetch_lmp_node_records(
    *,
    endpoint: str,
    business_date: date,
    node: str,
    price_status: str,
    time_resolution: str | None,
    subscription_key: str | None,
    pipeline_name: str,
    target_table: str,
    run_id: str | None,
    database: str | None,
    metadata: dict | None,
    log_fetch: bool,
    node_attempt: int,
) -> list[dict]:
    """Fetch MISO LMP records for one node."""
    params = {"node": node}
    if price_status in {"Preliminary", "Final"}:
        params["preliminaryFinal"] = price_status
    if time_resolution:
        params["timeResolution"] = time_resolution

    return data_exchange_client.fetch_pricing_data(
        endpoint,
        params=params,
        subscription_key=subscription_key,
        pipeline_name=pipeline_name,
        run_id=run_id,
        feed_name=pipeline_name,
        target_table=target_table,
        operation_name=pipeline_name,
        metadata={
            "operating_date": business_date.isoformat(),
            "node": node,
            "node_fetch_attempt": node_attempt,
            "price_status": price_status,
            "time_resolution": time_resolution,
            **(metadata or {}),
        },
        database=database,
        log_fetch=log_fetch,
    )


def raise_lmp_node_fetch_error(
    *,
    failed_nodes: dict[str, data_exchange_client.MISODataExchangeError],
    endpoint: str,
    attempts: int,
) -> None:
    """Raise a source exception after isolated node retries are exhausted."""
    details = "; ".join(
        f"{node}: {type(error).__name__}: {error}"
        for node, error in sorted(failed_nodes.items())
    )
    message = (
        f"MISO LMP node fetches failed after {attempts} isolated attempt(s) "
        f"for {endpoint}: {details}"
    )
    status_code = preferred_failed_node_status(failed_nodes.values())
    if all(
        isinstance(error, data_exchange_client.MISODataNotAvailable)
        for error in failed_nodes.values()
    ):
        raise data_exchange_client.MISODataNotAvailable(
            message,
            status_code=status_code,
        )
    raise data_exchange_client.MISODataExchangeError(
        message,
        status_code=status_code,
    )


def preferred_failed_node_status(
    errors,
) -> int | None:
    """Choose a representative status code for aggregate node failures."""
    statuses = [error.status_code for error in errors]
    retryable_status = next(
        (
            status
            for status in statuses
            if status in RETRYABLE_NODE_STATUS_CODES
        ),
        None,
    )
    if retryable_status is not None:
        return retryable_status
    if any(status is None for status in statuses):
        return None
    return next((status for status in statuses if status is not None), None)


def format_lmp_records(
    records: list[dict],
    *,
    operating_date,
    source_endpoint: str,
    market_run_id: str,
    price_status: str,
    fallback_time_resolution: str | None = None,
    source_version: str = SOURCE_VERSION,
) -> pd.DataFrame:
    """Normalize MISO LMP component records into one row per node interval."""
    business_date = coerce_operating_date(operating_date)
    rows = []
    for record in records:
        if not isinstance(record, dict):
            continue
        time_interval = record.get("timeInterval")
        if not isinstance(time_interval, dict):
            continue

        interval_start = fixed_est_to_utc(time_interval.get("start"))
        interval_end = fixed_est_to_utc(time_interval.get("end"))
        node = str(record.get("node") or "").strip()
        if pd.isna(interval_start) or pd.isna(interval_end) or not node:
            continue

        rows.append(
            {
                "interval_start_time_utc": interval_start,
                "interval_end_time_utc": interval_end,
                "operating_date": business_date,
                "operating_hour": _resolve_operating_hour(record, time_interval),
                "operating_interval": 0,
                "node_id": node,
                "node": node,
                "market_run_id": market_run_id,
                "price_status": price_status,
                "time_resolution": str(
                    time_interval.get("resolution") or fallback_time_resolution or ""
                ).strip(),
                "locational_marginal_price": _parse_float(record.get("lmp")),
                "energy_component": _parse_float(record.get("mec")),
                "congestion_component": _parse_float(record.get("mcc")),
                "loss_component": _parse_float(record.get("mlc")),
                "source_endpoint": source_endpoint,
                "source_version": source_version,
            }
        )

    df = pd.DataFrame(rows, columns=TARGET_COLUMNS)
    if df.empty:
        return df

    df["interval_start_time_utc"] = pd.to_datetime(
        df["interval_start_time_utc"],
        utc=True,
        errors="raise",
    )
    df["interval_end_time_utc"] = pd.to_datetime(
        df["interval_end_time_utc"],
        utc=True,
        errors="raise",
    )
    df["operating_date"] = pd.to_datetime(df["operating_date"]).dt.date
    df["operating_hour"] = pd.to_numeric(
        df["operating_hour"],
        errors="coerce",
    ).astype("Int64")
    df["operating_interval"] = pd.to_numeric(
        df["operating_interval"],
        errors="coerce",
    ).astype("Int64")
    for column in [
        "node_id",
        "node",
        "market_run_id",
        "price_status",
        "time_resolution",
        "source_endpoint",
        "source_version",
    ]:
        df[column] = df[column].astype(str).str.strip()
    for column in [
        "locational_marginal_price",
        "energy_component",
        "congestion_component",
        "loss_component",
    ]:
        df[column] = pd.to_numeric(df[column], errors="coerce")

    df.dropna(subset=PRIMARY_KEY, inplace=True)
    df.drop_duplicates(subset=PRIMARY_KEY, keep="last", inplace=True)
    df.sort_values(PRIMARY_KEY, inplace=True)
    df.reset_index(drop=True, inplace=True)
    return df[TARGET_COLUMNS]


def upsert_lmps(
    *,
    df: pd.DataFrame,
    schema: str,
    table_name: str,
    database: str | None = None,
    primary_key: list[str] | None = None,
) -> None:
    """Upsert normalized MISO LMP rows into a pre-created target table."""
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


def coerce_operating_date(value) -> date:
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    return pd.Timestamp(value).date()


def market_day_window_utc(operating_date) -> tuple[pd.Timestamp, pd.Timestamp]:
    business_date = coerce_operating_date(operating_date)
    start = pd.Timestamp(datetime.combine(business_date, datetime.min.time()))
    end = pd.Timestamp(
        datetime.combine(business_date + timedelta(days=1), datetime.min.time())
    )
    return fixed_est_to_utc(start), fixed_est_to_utc(end)


def fixed_est_to_utc(value) -> pd.Timestamp:
    timestamp = pd.Timestamp(value)
    if pd.isna(timestamp):
        return pd.NaT
    if timestamp.tzinfo is None:
        timestamp = pd.Timestamp(timestamp.to_pydatetime().replace(tzinfo=FIXED_EST_TIMEZONE))
    return timestamp.tz_convert("UTC")


def _resolve_operating_hour(record: dict, time_interval: dict) -> int | None:
    for value in (time_interval.get("value"), record.get("interval")):
        parsed = _parse_int(value)
        if parsed is not None:
            return parsed
    start = pd.Timestamp(time_interval.get("start"))
    if pd.isna(start):
        return None
    return int(start.hour) + 1


def _parse_int(value) -> int | None:
    if value is None:
        return None
    text = str(value).strip()
    if not text:
        return None
    try:
        return int(text.split(":", 1)[0])
    except ValueError:
        return None


def _parse_float(value) -> float | None:
    if value is None:
        return None
    text = str(value).strip()
    if not text:
        return None
    return float(text)
