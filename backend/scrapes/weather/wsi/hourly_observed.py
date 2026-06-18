"""WSI Trader hourly observed temperatures."""

from __future__ import annotations

import logging
from collections.abc import Mapping
from datetime import datetime
from pathlib import Path
from uuid import uuid4

import pandas as pd
from dateutil.relativedelta import relativedelta

from backend import credentials
from backend.scrapes.weather.wsi import client
from backend.scrapes.weather.wsi.stations import STATION_BASKETS
from backend.utils import db, script_logging
from backend.utils.ops_logging import redact_secrets

API_SCRAPE_NAME = "wsi_hourly_observed_temperatures"
SOURCE_SYSTEM = "wsi"
SOURCE_PRODUCT_ID = "HISTORICAL_HOURLY_OBSERVED"
TARGET_SCHEMA = "weather"
TARGET_TABLE = "wsi_hourly_observed_temperatures"
TARGET_TABLE_FQN = f"{TARGET_SCHEMA}.{TARGET_TABLE}"
PRIMARY_KEY = ["station_id", "observation_time_local", "region"]
DEFAULT_BASE_URL = (
    "https://www.wsitrader.com/Services/CSVDownloadService.svc/GetHistoricalObservations"
)
DEFAULT_REGION = "PJM"
DEFAULT_LOOKBACK_DAYS = 2
DEFAULT_DELTA = relativedelta(days=1)
DEFAULT_TEMP_UNITS = "F"
DEFAULT_TIMEUTC = "false"
DEFAULT_DATA_TYPES = [
    "temperature",
    "dewpoint",
    "cloudCover",
    "windDirection",
    "windSpeed",
    "heatIndex",
    "windChill",
    "relativeHumidity",
    "precipitation",
]
OUTPUT_COLUMNS = [
    "station_id",
    "station_name",
    "region",
    "observation_date",
    "hour_beginning",
    "observation_time_local",
    "temp_f",
    "dew_point_f",
    "feels_like_f",
    "wind_chill_f",
    "heat_index_f",
    "wind_speed_mph",
    "wind_dir_degrees",
    "relative_humidity_pct",
    "cloud_cover_pct",
    "precip_in",
    "source_product_id",
    "source_updated_at",
]
SQL_DATA_TYPES = [
    "VARCHAR",
    "VARCHAR",
    "VARCHAR",
    "DATE",
    "INTEGER",
    "TIMESTAMP",
    "DOUBLE PRECISION",
    "DOUBLE PRECISION",
    "DOUBLE PRECISION",
    "DOUBLE PRECISION",
    "DOUBLE PRECISION",
    "DOUBLE PRECISION",
    "DOUBLE PRECISION",
    "DOUBLE PRECISION",
    "DOUBLE PRECISION",
    "DOUBLE PRECISION",
    "VARCHAR",
    "TIMESTAMPTZ",
]

logger = logging.getLogger(__name__)


def _resolve_default_start_date() -> datetime:
    return datetime.now() - relativedelta(days=DEFAULT_LOOKBACK_DAYS)


def _resolve_default_end_date() -> datetime:
    return datetime.now()


def _wsi_date(value: datetime) -> str:
    return value.strftime("%m/%d/%Y")


def normalize_hourly_observed_frame(
    df: pd.DataFrame,
    *,
    region: str,
    station_id: str,
    station_name: str,
    source_updated_at: datetime,
) -> pd.DataFrame:
    """Normalize one station's WSI historical-observed CSV frame."""
    if df.empty:
        return pd.DataFrame(columns=OUTPUT_COLUMNS)

    normalized = df.copy()
    normalized.columns = [_canonical_column(column) for column in normalized.columns]
    rename_map = {
        "date": "observation_date",
        "hour": "hour_beginning",
        "temperature": "temp_f",
        "temperature_f": "temp_f",
        "dewpoint": "dew_point_f",
        "dew_point": "dew_point_f",
        "dewpoint_f": "dew_point_f",
        "windchill": "wind_chill_f",
        "wind_chill": "wind_chill_f",
        "heatindex": "heat_index_f",
        "heat_index": "heat_index_f",
        "windspeed": "wind_speed_mph",
        "wind_speed": "wind_speed_mph",
        "winddirection": "wind_dir_degrees",
        "wind_direction": "wind_dir_degrees",
        "winddir": "wind_dir_degrees",
        "rh": "relative_humidity_pct",
        "relativehumidity": "relative_humidity_pct",
        "relative_humidity": "relative_humidity_pct",
        "cloudcover": "cloud_cover_pct",
        "cloud_cover": "cloud_cover_pct",
        "precipitation": "precip_in",
        "precip": "precip_in",
    }
    normalized.rename(
        columns={column: rename_map.get(column, column) for column in normalized.columns},
        inplace=True,
    )

    required = {"observation_date", "hour_beginning"}
    missing = required - set(normalized.columns)
    if missing:
        raise ValueError(f"WSI hourly observed frame missing columns: {sorted(missing)}")

    normalized["station_id"] = station_id
    normalized["station_name"] = station_name
    normalized["region"] = region
    normalized["observation_date"] = pd.to_datetime(
        normalized["observation_date"],
        errors="coerce",
    ).dt.date
    normalized["hour_beginning"] = pd.to_numeric(
        normalized["hour_beginning"],
        errors="coerce",
    )
    normalized = normalized.dropna(subset=["observation_date", "hour_beginning"]).copy()
    normalized["hour_beginning"] = normalized["hour_beginning"].astype(int)
    normalized["observation_time_local"] = pd.to_datetime(
        normalized["observation_date"].astype(str),
    ) + pd.to_timedelta(normalized["hour_beginning"], unit="h")

    for column in [
        "temp_f",
        "dew_point_f",
        "wind_chill_f",
        "heat_index_f",
        "wind_speed_mph",
        "wind_dir_degrees",
        "relative_humidity_pct",
        "cloud_cover_pct",
        "precip_in",
    ]:
        if column not in normalized:
            normalized[column] = pd.NA
        normalized[column] = _numeric_series(normalized[column])

    normalized["feels_like_f"] = normalized["heat_index_f"].where(
        normalized["heat_index_f"].notna(),
        normalized["wind_chill_f"],
    )
    normalized["feels_like_f"] = normalized["feels_like_f"].where(
        normalized["feels_like_f"].notna(),
        normalized["temp_f"],
    )
    normalized["source_product_id"] = SOURCE_PRODUCT_ID
    normalized["source_updated_at"] = pd.Timestamp(source_updated_at, tz="UTC")

    return (
        normalized[OUTPUT_COLUMNS]
        .drop_duplicates(subset=PRIMARY_KEY, keep="last")
        .sort_values(PRIMARY_KEY)
        .reset_index(drop=True)
    )


def _pull_station(
    *,
    start_date: datetime,
    end_date: datetime,
    region: str,
    station_id: str,
    station_name: str,
    run_id: str | None,
    database: str | None,
    metadata: dict | None = None,
) -> pd.DataFrame:
    source_updated_at = datetime.utcnow()
    params = {
        "StartDate": _wsi_date(start_date),
        "EndDate": _wsi_date(end_date),
        "CityIds[]": station_id,
        "HistoricalProductID": SOURCE_PRODUCT_ID,
        "DataTypes[]": DEFAULT_DATA_TYPES,
        "TempUnits": DEFAULT_TEMP_UNITS,
        "timeutc": DEFAULT_TIMEUTC,
    }
    logger.info(
        "wsi_request: %s",
        client.sanitized_request_context(DEFAULT_BASE_URL, params),
    )
    df = client.read_wsi_csv(
        base_url=DEFAULT_BASE_URL,
        params=params,
        skiprows=1,
        required_columns=["Date", "Hour"],
        pipeline_name=API_SCRAPE_NAME,
        operation_name="GetHistoricalObservations",
        target_table=TARGET_TABLE_FQN,
        run_id=run_id,
        feed_name=API_SCRAPE_NAME,
        database=database,
        metadata={
            "region": region,
            "station_id": station_id,
            "station_name": station_name,
            **(metadata or {}),
        },
    )
    return normalize_hourly_observed_frame(
        df,
        region=region,
        station_id=station_id,
        station_name=station_name,
        source_updated_at=source_updated_at,
    )


def _pull(
    *,
    start_date: datetime,
    end_date: datetime,
    region: str = DEFAULT_REGION,
    stations: Mapping[str, str] | None = None,
    run_id: str | None = None,
    database: str | None = None,
    metadata: dict | None = None,
) -> pd.DataFrame:
    station_map = dict(stations or STATION_BASKETS[region])
    frames: list[pd.DataFrame] = []
    for station_id, station_name in station_map.items():
        logger.info("Pulling WSI observed rows for %s %s", region, station_id)
        frames.append(
            _pull_station(
                start_date=start_date,
                end_date=end_date,
                region=region,
                station_id=station_id,
                station_name=station_name,
                run_id=run_id,
                database=database,
                metadata=metadata,
            )
        )

    if not frames:
        return pd.DataFrame(columns=OUTPUT_COLUMNS)
    return pd.concat(frames, ignore_index=True)


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
    start_date: datetime | None = None,
    end_date: datetime | None = None,
    region: str = DEFAULT_REGION,
    stations: Mapping[str, str] | None = None,
    database: str | None = None,
    run_mode: str = "manual",
    metadata: dict | None = None,
) -> pd.DataFrame | None:
    """Pull and upsert WSI hourly observed temperatures for one station basket."""
    start_date = start_date or _resolve_default_start_date()
    end_date = end_date or _resolve_default_end_date()
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
        run_logger.info(f"Run mode: {run_mode}")
        run_logger.info(f"Region: {region}")
        run_logger.info(f"Window: {start_date:%Y-%m-%d} through {end_date:%Y-%m-%d}")
        fetch_metadata = {"run_mode": run_mode, **(metadata or {})}
        df = _pull(
            start_date=start_date,
            end_date=end_date,
            region=region,
            stations=stations,
            run_id=run_id,
            database=database,
            metadata=fetch_metadata,
        )
        if df.empty:
            run_logger.section("No WSI hourly observed rows returned; skipping upsert.")
        else:
            run_logger.section(f"Upserting {len(df)} rows...")
            _upsert(df, database=database)
            run_logger.success(
                f"{API_SCRAPE_NAME} completed; {len(df)} rows processed."
            )
        return df if not df.empty else None
    except Exception as exc:
        run_logger.exception(f"Pipeline failed: {redact_secrets(str(exc))}")
        raise
    finally:
        script_logging.close_logging()


def _canonical_column(column: object) -> str:
    value = str(column).strip().lower()
    value = value.replace("(", " ").replace(")", " ")
    return "_".join(value.split())


def _numeric_series(series: pd.Series) -> pd.Series:
    return pd.to_numeric(
        series.astype("string")
        .str.strip()
        .str.replace("%", "", regex=False)
        .str.replace(":00", "", regex=False),
        errors="coerce",
    )


if __name__ == "__main__":
    main()
