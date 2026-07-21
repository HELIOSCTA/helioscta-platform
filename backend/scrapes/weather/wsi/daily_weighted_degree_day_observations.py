"""WSI Trader daily weighted observed degree days."""

from __future__ import annotations

import logging
import re
import time
from collections.abc import Iterable
from datetime import date, datetime, timedelta, timezone
from io import StringIO
from pathlib import Path
from uuid import uuid4

import pandas as pd

from backend import credentials
from backend.scrapes.weather.wsi import _daily_weighted_common as common
from backend.scrapes.weather.wsi import client
from backend.utils import db, script_logging
from backend.utils.ops_logging import redact_secrets

API_SCRAPE_NAME = "wsi_daily_weighted_degree_day_observations"
SOURCE_SYSTEM = "wsi"
SOURCE_PRODUCT_ID = "HISTORICAL_WEIGHTED_DEGREEDAYS"
TARGET_SCHEMA = "weather"
TARGET_TABLE = "wsi_daily_weighted_degree_day_observations"
TARGET_TABLE_FQN = f"{TARGET_SCHEMA}.{TARGET_TABLE}"
PRIMARY_KEY = [
    "source_product_id",
    "request_region",
    "entity_id",
    "observation_date",
    "metric_name",
]
DEFAULT_BASE_URL = (
    "https://www.wsitrader.com/Services/CSVDownloadService.svc/"
    "GetHistoricalObservations"
)
DEFAULT_REQUEST_REGION = "NA"
DEFAULT_LOOKBACK_DAYS = 14
DEFAULT_TEMP_UNITS = "F"
DEFAULT_IS_DAILY = True
DEFAULT_IS_TEMP = True
DEFAULT_IS_DISPLAY_DATES = True
DEFAULT_STATIONS = [
    "CONUS",
    "EAST",
    "MIDWEST",
    "SOUTHCENTRAL",
    "MOUNTAIN",
    "PACIFIC",
]
DEFAULT_DATA_TYPES = [
    "gas_hdd",
    "gas_cdd",
    "oil_hdd",
    "oil_cdd",
    "electric_hdd",
    "electric_cdd",
    "population_hdd",
    "population_cdd",
]
EXPECTED_METRIC_NAMES = sorted(DEFAULT_DATA_TYPES)
OUTPUT_COLUMNS = [
    "source_product_id",
    "source_banner",
    "scrape_run_at_utc",
    "request_start_date",
    "request_end_date",
    "request_region",
    "entity_id",
    "temp_units",
    "is_daily",
    "is_temp",
    "is_display_dates",
    "observation_date",
    "metric_name",
    "metric_value",
    "metric_unit",
]
SQL_DATA_TYPES = [
    "VARCHAR",
    "VARCHAR",
    "TIMESTAMPTZ",
    "DATE",
    "DATE",
    "VARCHAR",
    "VARCHAR",
    "VARCHAR",
    "BOOLEAN",
    "BOOLEAN",
    "BOOLEAN",
    "DATE",
    "VARCHAR",
    "DOUBLE PRECISION",
    "VARCHAR",
]
IDENTIFIER_COLUMNS = {"site_id", "valid_time"}

logger = logging.getLogger(__name__)


def _resolve_default_end_date() -> date:
    return datetime.now(timezone.utc).date()


def _resolve_default_start_date() -> date:
    return _resolve_default_end_date() - timedelta(days=DEFAULT_LOOKBACK_DAYS)


def parse_daily_weighted_degree_day_observations_text(
    text: str,
    *,
    request_start_date: date | datetime | str | None = None,
    request_end_date: date | datetime | str | None = None,
    request_region: str = DEFAULT_REQUEST_REGION,
    temp_units: str = DEFAULT_TEMP_UNITS,
    is_daily: bool = DEFAULT_IS_DAILY,
    is_temp: bool = DEFAULT_IS_TEMP,
    is_display_dates: bool = DEFAULT_IS_DISPLAY_DATES,
    scrape_run_at_utc: datetime | None = None,
) -> pd.DataFrame:
    """Normalize WSI historical weighted-degree-day text into long-form rows."""
    scrape_run_at_utc = scrape_run_at_utc or common.utc_now()
    source_banner = common.first_nonempty_line(text)
    start_date = _normalize_date(request_start_date) if request_start_date else None
    end_date = _normalize_date(request_end_date) if request_end_date else None

    csv_lines = [line for line in text.splitlines()[1:] if line.strip()]
    if not csv_lines:
        raise ValueError("WSI weighted-degree-day observations missing CSV rows.")
    try:
        source = pd.read_csv(StringIO("\n".join(csv_lines)))
    except pd.errors.EmptyDataError as exc:
        raise ValueError(
            "WSI weighted-degree-day observations contained no CSV data."
        ) from exc
    except pd.errors.ParserError as exc:
        raise ValueError(
            f"Failed to parse WSI weighted-degree-day observations CSV: {exc}"
        ) from exc

    normalized = source.copy()
    normalized.columns = [_canonical_column(column) for column in normalized.columns]
    missing = [
        column for column in ["site_id", "valid_time"] if column not in normalized.columns
    ]
    if missing:
        raise ValueError(
            "WSI weighted-degree-day observations missing required columns. "
            f"Missing={missing}, Actual={normalized.columns.tolist()}"
        )

    metric_columns = [
        column for column in normalized.columns if column not in IDENTIFIER_COLUMNS
    ]
    if not metric_columns:
        raise ValueError("WSI weighted-degree-day observations have no metric columns.")
    if normalized.empty:
        return _empty_result(
            source_banner=source_banner,
            scrape_run_at_utc=scrape_run_at_utc,
            request_start_date=start_date,
            request_end_date=end_date,
        )

    records: list[dict[str, object]] = []
    for row in normalized.to_dict("records"):
        observation_date = pd.to_datetime(row["valid_time"], errors="coerce")
        if pd.isna(observation_date):
            raise ValueError(
                f"Could not parse WSI valid_time value: {row['valid_time']}"
            )

        for metric_name in metric_columns:
            records.append(
                {
                    "source_product_id": SOURCE_PRODUCT_ID,
                    "source_banner": source_banner,
                    "scrape_run_at_utc": pd.Timestamp(scrape_run_at_utc),
                    "request_start_date": start_date,
                    "request_end_date": end_date,
                    "request_region": request_region,
                    "entity_id": str(row["site_id"]).strip(),
                    "temp_units": temp_units,
                    "is_daily": is_daily,
                    "is_temp": is_temp,
                    "is_display_dates": is_display_dates,
                    "observation_date": pd.Timestamp(observation_date).date(),
                    "metric_name": metric_name,
                    "metric_value": common.numeric_value(row[metric_name]),
                    "metric_unit": "degree_day_f",
                }
            )

    if not records:
        return _empty_result(
            source_banner=source_banner,
            scrape_run_at_utc=scrape_run_at_utc,
            request_start_date=start_date,
            request_end_date=end_date,
        )
    result = (
        pd.DataFrame(records, columns=OUTPUT_COLUMNS)
        .drop_duplicates(subset=PRIMARY_KEY, keep="last")
        .sort_values(PRIMARY_KEY)
        .reset_index(drop=True)
    )
    result.attrs.update(
        {
            "source_banner": source_banner,
            "scrape_run_at_utc": pd.Timestamp(scrape_run_at_utc),
            "request_start_date": start_date,
            "request_end_date": end_date,
        }
    )
    return result


def _pull(
    *,
    start_date: date | datetime | str,
    end_date: date | datetime | str,
    request_region: str = DEFAULT_REQUEST_REGION,
    stations: Iterable[str] | None = None,
    data_types: Iterable[str] | None = None,
    temp_units: str = DEFAULT_TEMP_UNITS,
    is_daily: bool = DEFAULT_IS_DAILY,
    is_temp: bool = DEFAULT_IS_TEMP,
    is_display_dates: bool = DEFAULT_IS_DISPLAY_DATES,
    run_id: str | None = None,
    database: str | None = None,
    scrape_run_at_utc: datetime | None = None,
    metadata: dict | None = None,
) -> pd.DataFrame:
    scrape_run_at_utc = scrape_run_at_utc or common.utc_now()
    selected_stations = list(stations or DEFAULT_STATIONS)
    selected_data_types = list(data_types or DEFAULT_DATA_TYPES)
    start = _normalize_date(start_date)
    end = _normalize_date(end_date)
    params = {
        "StartDate": _wsi_date(start),
        "EndDate": _wsi_date(end),
        "CityIds[]": selected_stations,
        "HistoricalProductID": SOURCE_PRODUCT_ID,
        "DataTypes[]": selected_data_types,
        "TempUnits": temp_units,
        "IsDaily": _bool_param(is_daily),
        "IsTemp": _bool_param(is_temp),
        "IsDisplayDates": _bool_param(is_display_dates),
    }
    logger.info(
        "wsi_request: %s",
        client.sanitized_request_context(DEFAULT_BASE_URL, params),
    )
    fetch_metadata = {
        "request_region": request_region,
        "stations": selected_stations,
        "historical_product_id": SOURCE_PRODUCT_ID,
        "data_types": selected_data_types,
        "temp_units": temp_units,
        "is_daily": is_daily,
        "is_temp": is_temp,
        "is_display_dates": is_display_dates,
        "start_date": start.isoformat(),
        "end_date": end.isoformat(),
        **(metadata or {}),
    }
    text = client._HTTP_CLIENT.get_text(
        base_url=DEFAULT_BASE_URL,
        params=params,
        pipeline_name=API_SCRAPE_NAME,
        operation_name="GetHistoricalObservations",
        target_table=TARGET_TABLE_FQN,
        run_id=run_id,
        feed_name=API_SCRAPE_NAME,
        database=database,
        metadata=fetch_metadata,
    )
    parse_started_at = time.perf_counter()
    try:
        return parse_daily_weighted_degree_day_observations_text(
            text,
            request_start_date=start,
            request_end_date=end,
            request_region=request_region,
            temp_units=temp_units,
            is_daily=is_daily,
            is_temp=is_temp,
            is_display_dates=is_display_dates,
            scrape_run_at_utc=scrape_run_at_utc,
        )
    except Exception as exc:
        client.log_wsi_fetch_event(
            base_url=DEFAULT_BASE_URL,
            pipeline_name=API_SCRAPE_NAME,
            operation_name="GetHistoricalObservations",
            target_table=TARGET_TABLE_FQN,
            status="failure",
            http_status=200,
            elapsed_ms=round((time.perf_counter() - parse_started_at) * 1000),
            run_id=run_id,
            feed_name=API_SCRAPE_NAME,
            database=database,
            error_type=type(exc).__name__,
            error_message=str(exc),
            metadata=client.with_telemetry_stage(
                fetch_metadata,
                "parse_daily_weighted_degree_day_observations_csv",
            ),
        )
        raise


def _upsert(df: pd.DataFrame, database: str | None = None) -> None:
    if df.empty:
        return
    db.upsert_dataframe(
        database=database,
        schema=TARGET_SCHEMA,
        table_name=TARGET_TABLE,
        df=df,
        columns=OUTPUT_COLUMNS,
        data_types=SQL_DATA_TYPES,
        primary_key=PRIMARY_KEY,
    )


def main(
    *,
    start_date: date | datetime | str | None = None,
    end_date: date | datetime | str | None = None,
    request_region: str = DEFAULT_REQUEST_REGION,
    stations: Iterable[str] | None = None,
    data_types: Iterable[str] | None = None,
    temp_units: str = DEFAULT_TEMP_UNITS,
    is_daily: bool = DEFAULT_IS_DAILY,
    is_temp: bool = DEFAULT_IS_TEMP,
    is_display_dates: bool = DEFAULT_IS_DISPLAY_DATES,
    database: str | None = None,
    run_mode: str = "manual",
    metadata: dict | None = None,
) -> pd.DataFrame | None:
    """Pull and upsert WSI daily weighted observed degree-day rows."""
    start = _normalize_date(start_date) if start_date else _resolve_default_start_date()
    end = _normalize_date(end_date) if end_date else _resolve_default_end_date()
    database = database or credentials.AZURE_POSTGRESQL_DB_NAME
    selected_stations = list(stations or DEFAULT_STATIONS)
    selected_data_types = list(data_types or DEFAULT_DATA_TYPES)
    run_logger = script_logging.init_logging(
        name=API_SCRAPE_NAME,
        log_dir=script_logging.get_log_dir(Path(__file__).parent / "logs"),
        log_to_file=True,
        delete_if_no_errors=True,
    )
    run_id = str(uuid4())
    scrape_run_at_utc = common.utc_now()

    try:
        run_logger.header(API_SCRAPE_NAME)
        run_logger.info(f"Run ID: {run_id}")
        run_logger.info(f"Run mode: {run_mode}")
        run_logger.info(f"Request region: {request_region}")
        run_logger.info(f"Stations: {', '.join(selected_stations)}")
        run_logger.info(f"Window: {start:%Y-%m-%d} through {end:%Y-%m-%d}")
        fetch_metadata = {"run_mode": run_mode, **(metadata or {})}
        df = _pull(
            start_date=start,
            end_date=end,
            request_region=request_region,
            stations=selected_stations,
            data_types=selected_data_types,
            temp_units=temp_units,
            is_daily=is_daily,
            is_temp=is_temp,
            is_display_dates=is_display_dates,
            run_id=run_id,
            database=database,
            scrape_run_at_utc=scrape_run_at_utc,
            metadata=fetch_metadata,
        )
        if df.empty:
            run_logger.section(
                "No WSI daily weighted observed degree-day rows returned; "
                "skipping upsert."
            )
        else:
            run_logger.section(f"Upserting {len(df)} rows...")
            _upsert(df, database=database)
            run_logger.success(
                f"{API_SCRAPE_NAME} completed; {len(df)} rows processed."
            )
        return df
    except Exception as exc:
        run_logger.exception(f"Pipeline failed: {redact_secrets(str(exc))}")
        raise
    finally:
        script_logging.close_logging()


def _canonical_column(column: object) -> str:
    value = str(column).strip().lower()
    value = re.sub(r"\(([^)]*)\)", r"_\1", value)
    value = re.sub(r"[^a-z0-9]+", "_", value)
    return value.strip("_")


def _empty_result(
    *,
    source_banner: str | None,
    scrape_run_at_utc: datetime,
    request_start_date: date | None,
    request_end_date: date | None,
) -> pd.DataFrame:
    result = pd.DataFrame(columns=OUTPUT_COLUMNS)
    result.attrs.update(
        {
            "source_banner": source_banner,
            "scrape_run_at_utc": pd.Timestamp(scrape_run_at_utc),
            "request_start_date": request_start_date,
            "request_end_date": request_end_date,
        }
    )
    return result


def _normalize_date(value: date | datetime | str) -> date:
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    return date.fromisoformat(str(value))


def _wsi_date(value: date) -> str:
    return value.strftime("%m/%d/%Y")


def _bool_param(value: bool) -> str:
    return "true" if value else "false"


if __name__ == "__main__":
    main()
