"""MISO Real-Time Total Load.

Source definition:
https://www.misoenergy.org/markets-and-operations/rtdataapis/

Feed metadata reviewed from MISO RT Data API page and live endpoint probe on
2026-06-13:
- Feed short name: real_time_total_load
- Display name: Real Time Total Load
- Endpoint: /api/RealTimeTotalLoad
- Source system: MISO public Real-Time Data API
- Grain: one row per operating date, series, and source period label
- Series: hourly cleared MW, hourly medium-term load forecast, five-minute
  total load
- Courtesy limit: avoid fetching the public link more than once per minute
"""
from __future__ import annotations

import logging
import re
from datetime import datetime
from pathlib import Path
from uuid import uuid4

import pandas as pd

from backend import credentials
from backend.scrapes.power.miso import client
from backend.utils import db, script_logging


API_SCRAPE_NAME = "real_time_total_load"
ENDPOINT = "api/RealTimeTotalLoad"
TARGET_DATABASE: str | None = None
TARGET_SCHEMA = "miso"
TARGET_TABLE = API_SCRAPE_NAME
TARGET_TABLE_FQN = f"{TARGET_SCHEMA}.{TARGET_TABLE}"
PRIMARY_KEY = ["series", "operating_date", "period_label"]
TARGET_COLUMNS = [
    "operating_date",
    "series",
    "period_label",
    "hour_ending",
    "interval_start",
    "load_mw",
    "source_ref_id",
    "source_interval_start",
]
TARGET_DATA_TYPES = [
    "DATE",
    "VARCHAR",
    "VARCHAR",
    "INTEGER",
    "TIMESTAMP",
    "FLOAT",
    "VARCHAR",
    "TIMESTAMP",
]
LOCAL_MARKET_TIMEZONE = "America/New_York"

SERIES_CLEARED_MW_HOURLY = "cleared_mw_hourly"
SERIES_MEDIUM_TERM_LOAD_FORECAST = "medium_term_load_forecast"
SERIES_FIVE_MIN_TOTAL_LOAD = "five_min_total_load"

logger = logging.getLogger(__name__)


def _pull(
    *,
    run_id: str | None = None,
    database: str | None = None,
    metadata: dict | None = None,
) -> pd.DataFrame:
    """Pull and format MISO real-time total load from the public JSON API."""
    response = client.make_get_request(
        ENDPOINT,
        pipeline_name=API_SCRAPE_NAME,
        run_id=run_id,
        feed_name=API_SCRAPE_NAME,
        target_table=TARGET_TABLE_FQN,
        operation_name=API_SCRAPE_NAME,
        metadata=metadata,
        database=database,
    )
    return _format(client.parse_json_response(response))


def _format(payload: dict) -> pd.DataFrame:
    """Normalize MISO RealTimeTotalLoad JSON into a single table shape."""
    load_info = payload.get("LoadInfo")
    if not isinstance(load_info, dict):
        raise RuntimeError("MISO RealTimeTotalLoad payload missing LoadInfo object")

    source_ref_id = str(load_info.get("RefId") or "").strip()
    operating_date, source_interval_start = _parse_ref_id(source_ref_id)
    rows: list[dict] = []

    rows.extend(
        _format_hourly_series(
            records=load_info.get("ClearedMW", []),
            wrapper_key="ClearedMWHourly",
            hour_key="Hour",
            value_key="Value",
            series=SERIES_CLEARED_MW_HOURLY,
            operating_date=operating_date,
            source_ref_id=source_ref_id,
            source_interval_start=source_interval_start,
        )
    )
    rows.extend(
        _format_hourly_series(
            records=load_info.get("MediumTermLoadForecast", []),
            wrapper_key="Forecast",
            hour_key="HourEnding",
            value_key="LoadForecast",
            series=SERIES_MEDIUM_TERM_LOAD_FORECAST,
            operating_date=operating_date,
            source_ref_id=source_ref_id,
            source_interval_start=source_interval_start,
        )
    )
    rows.extend(
        _format_five_min_series(
            records=load_info.get("FiveMinTotalLoad", []),
            operating_date=operating_date,
            source_ref_id=source_ref_id,
            source_interval_start=source_interval_start,
        )
    )

    df = pd.DataFrame(rows)
    if df.empty:
        return df

    df["operating_date"] = pd.to_datetime(df["operating_date"]).dt.date
    df["hour_ending"] = pd.to_numeric(df["hour_ending"], errors="coerce").astype(
        "Int64"
    )
    df["interval_start"] = pd.to_datetime(df["interval_start"], errors="coerce")
    df["source_interval_start"] = pd.to_datetime(
        df["source_interval_start"],
        errors="coerce",
    )
    df["load_mw"] = pd.to_numeric(df["load_mw"], errors="coerce")
    df.dropna(subset=["series", "operating_date", "period_label"], inplace=True)
    df.drop_duplicates(subset=PRIMARY_KEY, keep="last", inplace=True)
    df.sort_values(PRIMARY_KEY, inplace=True)
    df.reset_index(drop=True, inplace=True)
    return df


def _format_hourly_series(
    *,
    records: object,
    wrapper_key: str,
    hour_key: str,
    value_key: str,
    series: str,
    operating_date,
    source_ref_id: str,
    source_interval_start: pd.Timestamp,
) -> list[dict]:
    if not isinstance(records, list):
        return []

    rows = []
    for record in records:
        item = record.get(wrapper_key) if isinstance(record, dict) else None
        if not isinstance(item, dict):
            continue
        hour_ending = _parse_int(item.get(hour_key))
        if hour_ending is None:
            continue
        rows.append(
            {
                "operating_date": operating_date,
                "series": series,
                "period_label": f"HE{hour_ending:02d}",
                "hour_ending": hour_ending,
                "interval_start": pd.NaT,
                "load_mw": _parse_float(item.get(value_key)),
                "source_ref_id": source_ref_id,
                "source_interval_start": source_interval_start,
            }
        )
    return rows


def _format_five_min_series(
    *,
    records: object,
    operating_date,
    source_ref_id: str,
    source_interval_start: pd.Timestamp,
) -> list[dict]:
    if not isinstance(records, list):
        return []

    rows = []
    for record in records:
        item = record.get("Load") if isinstance(record, dict) else None
        if not isinstance(item, dict):
            continue
        period_label = str(item.get("Time") or "").strip()
        interval_start = _combine_operating_date_time(operating_date, period_label)
        if pd.isna(interval_start):
            continue
        rows.append(
            {
                "operating_date": operating_date,
                "series": SERIES_FIVE_MIN_TOTAL_LOAD,
                "period_label": period_label,
                "hour_ending": None,
                "interval_start": interval_start,
                "load_mw": _parse_float(item.get("Value")),
                "source_ref_id": source_ref_id,
                "source_interval_start": source_interval_start,
            }
        )
    return rows


def _parse_ref_id(ref_id: str):
    match = re.match(
        r"^(?P<date>\d{1,2}-[A-Za-z]{3}-\d{4})\s+-\s+Interval\s+"
        r"(?P<time>\d{1,2}:\d{2})\s+(?P<tz>[A-Za-z]+)$",
        ref_id,
    )
    if not match:
        raise RuntimeError(f"Unexpected MISO RealTimeTotalLoad RefId: {ref_id!r}")

    operating_date = pd.to_datetime(match.group("date"), format="%d-%b-%Y").date()
    source_interval_start = _combine_operating_date_time(
        operating_date,
        match.group("time"),
    )
    return operating_date, source_interval_start


def _combine_operating_date_time(operating_date, time_label: str) -> pd.Timestamp:
    try:
        parsed_time = datetime.strptime(time_label, "%H:%M").time()
    except ValueError:
        return pd.NaT
    return pd.Timestamp(datetime.combine(operating_date, parsed_time))


def _parse_int(value) -> int | None:
    if value is None:
        return None
    value_text = str(value).strip()
    if not value_text:
        return None
    return int(value_text.split(":", 1)[0])


def _parse_float(value) -> float | None:
    if value is None:
        return None
    value_text = str(value).strip()
    if not value_text:
        return None
    return float(value_text)


def _upsert(
    df: pd.DataFrame,
    database: str | None = TARGET_DATABASE,
    schema: str = TARGET_SCHEMA,
    table_name: str = TARGET_TABLE,
    primary_key: list[str] | None = None,
) -> None:
    if df.empty:
        logger.info("Skipping empty upsert into %s.%s", schema, table_name)
        return

    primary_key = primary_key or PRIMARY_KEY
    missing_keys = [col for col in primary_key if col not in df.columns]
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
        primary_key=primary_key,
    )


def main(database: str | None = None) -> pd.DataFrame | None:
    """Run the MISO real-time total load scrape."""
    database = database or credentials.AZURE_POSTGRESQL_DB_NAME
    run_logger = script_logging.init_logging(
        name=API_SCRAPE_NAME,
        log_dir=script_logging.get_log_dir(Path(__file__).parent / "logs"),
        log_to_file=True,
        delete_if_no_errors=True,
    )
    run_id = str(uuid4())

    try:
        run_logger.header(API_SCRAPE_NAME)
        run_logger.info(f"Run ID: {run_id}")
        df = _pull(run_id=run_id, database=database)

        if df.empty:
            run_logger.section("No data returned.")
        else:
            run_logger.section(f"Upserting {len(df)} rows...")
            _upsert(df=df, database=database)
            run_logger.success(
                f"{API_SCRAPE_NAME} completed; {len(df)} rows processed."
            )
            return df
    except Exception as exc:
        run_logger.exception(f"Pipeline failed: {exc}")
        raise
    finally:
        script_logging.close_logging()

    return None


if __name__ == "__main__":
    main()
