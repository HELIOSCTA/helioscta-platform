"""Shared MISO Data Exchange LMP normalization."""
from __future__ import annotations

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
) -> pd.DataFrame:
    """Pull and normalize MISO Data Exchange LMP rows for one operating date."""
    business_date = coerce_operating_date(operating_date)
    selected_nodes = tuple(nodes or DEFAULT_HUB_NODES)
    endpoint = endpoint_template.format(operating_date=business_date.isoformat())
    raw_records: list[dict] = []

    for node in selected_nodes:
        params = {"node": node}
        if price_status in {"Preliminary", "Final"}:
            params["preliminaryFinal"] = price_status
        if time_resolution:
            params["timeResolution"] = time_resolution

        raw_records.extend(
            data_exchange_client.fetch_pricing_data(
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
                    "price_status": price_status,
                    "time_resolution": time_resolution,
                    **(metadata or {}),
                },
                database=database,
                log_fetch=log_fetch,
            )
        )

    return format_lmp_records(
        raw_records,
        operating_date=business_date,
        source_endpoint=endpoint,
        market_run_id=market_run_id,
        price_status=price_status,
        fallback_time_resolution=time_resolution,
    )


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
