"""NOAA AviationWeather METAR observations."""

from __future__ import annotations

import math
from collections.abc import Mapping
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

import pandas as pd

from backend import credentials
from backend.scrapes.weather.noaa.client import CLIENT, NoaaAviationWeatherClient
from backend.scrapes.weather.noaa.stations import STATION_BASKETS
from backend.utils import db, script_logging
from backend.utils.ops_logging import redact_secrets

API_SCRAPE_NAME = "noaa_metar_observations"
SOURCE_SYSTEM = "noaa_aviationweather"
SOURCE_PRODUCT_ID = "METAR"
TARGET_SCHEMA = "weather"
TARGET_TABLE = "noaa_metar_observations"
TARGET_TABLE_FQN = f"{TARGET_SCHEMA}.{TARGET_TABLE}"
PRIMARY_KEY = ["station_id", "observation_time_utc"]
DEFAULT_REGION = "PJM"
DEFAULT_HOURS = 48
MAX_API_HOURS = 360
DEFAULT_MAX_ROWS_PER_REQUEST = 350
OUTPUT_COLUMNS = [
    "station_id",
    "station_name",
    "region",
    "observation_time_utc",
    "report_time_utc",
    "receipt_time_utc",
    "temp_f",
    "dew_point_f",
    "feels_like_f",
    "wind_speed_mph",
    "wind_gust_mph",
    "wind_dir_degrees",
    "pressure_mb",
    "visibility_miles",
    "relative_humidity_pct",
    "latitude",
    "longitude",
    "elevation_m",
    "flight_category",
    "raw_metar",
    "source_product_id",
    "source_updated_at",
]
SQL_DATA_TYPES = [
    "VARCHAR",
    "VARCHAR",
    "VARCHAR",
    "TIMESTAMPTZ",
    "TIMESTAMPTZ",
    "TIMESTAMPTZ",
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
    "DOUBLE PRECISION",
    "DOUBLE PRECISION",
    "VARCHAR",
    "TEXT",
    "VARCHAR",
    "TIMESTAMPTZ",
]


def normalize_metar_observations(
    rows: list[dict],
    *,
    region: str,
    stations: Mapping[str, str],
    source_updated_at: datetime,
) -> pd.DataFrame:
    """Normalize AviationWeather METAR JSON rows into the destination contract."""
    normalized_rows: list[dict] = []
    station_names = {station_id.upper(): name for station_id, name in stations.items()}
    for row in rows:
        station_id = str(row.get("icaoId") or "").upper().strip()
        if not station_id or station_id not in station_names:
            continue

        observation_time_utc = _parse_observation_time(row)
        if observation_time_utc is None:
            continue

        temp_c = _number(row.get("temp"))
        dew_point_c = _number(row.get("dewp"))
        temp_f = _c_to_f(temp_c)
        dew_point_f = _c_to_f(dew_point_c)
        wind_speed_mph = _knots_to_mph(_number(row.get("wspd")))
        wind_gust_mph = _knots_to_mph(_number(row.get("wgst")))
        relative_humidity_pct = _relative_humidity(temp_c, dew_point_c)

        normalized_rows.append(
            {
                "station_id": station_id,
                "station_name": str(row.get("name") or station_names[station_id]),
                "region": region,
                "observation_time_utc": observation_time_utc,
                "report_time_utc": _parse_datetime(row.get("reportTime")),
                "receipt_time_utc": _parse_datetime(row.get("receiptTime")),
                "temp_f": temp_f,
                "dew_point_f": dew_point_f,
                "feels_like_f": _feels_like_f(
                    temp_f=temp_f,
                    wind_speed_mph=wind_speed_mph,
                    relative_humidity_pct=relative_humidity_pct,
                ),
                "wind_speed_mph": wind_speed_mph,
                "wind_gust_mph": wind_gust_mph,
                "wind_dir_degrees": _number(row.get("wdir")),
                "pressure_mb": _number(row.get("slp")) or _number(row.get("altim")),
                "visibility_miles": _visibility_miles(row.get("visib")),
                "relative_humidity_pct": relative_humidity_pct,
                "latitude": _number(row.get("lat")),
                "longitude": _number(row.get("lon")),
                "elevation_m": _number(row.get("elev")),
                "flight_category": row.get("fltCat"),
                "raw_metar": row.get("rawOb"),
                "source_product_id": SOURCE_PRODUCT_ID,
                "source_updated_at": pd.Timestamp(source_updated_at, tz="UTC"),
            }
        )

    if not normalized_rows:
        return pd.DataFrame(columns=OUTPUT_COLUMNS)

    df = pd.DataFrame(normalized_rows)
    return (
        df[OUTPUT_COLUMNS]
        .drop_duplicates(subset=PRIMARY_KEY, keep="last")
        .sort_values(PRIMARY_KEY)
        .reset_index(drop=True)
    )


def _pull(
    *,
    region: str,
    stations: Mapping[str, str],
    hours: int,
    run_id: str | None,
    database: str | None,
    metadata: dict | None = None,
    api_client: NoaaAviationWeatherClient = CLIENT,
) -> pd.DataFrame:
    hours = max(1, min(int(hours), MAX_API_HOURS))
    station_ids = sorted(stations)
    rows: list[dict] = []
    batch_size = max(1, DEFAULT_MAX_ROWS_PER_REQUEST // hours)
    batches = list(_batched(station_ids, batch_size))
    for batch_index, batch_station_ids in enumerate(batches, start=1):
        rows.extend(
            api_client.get_metars(
                station_ids=batch_station_ids,
                hours=hours,
                pipeline_name=API_SCRAPE_NAME,
                operation_name="metar",
                target_table=TARGET_TABLE_FQN,
                run_id=run_id,
                feed_name=API_SCRAPE_NAME,
                database=database,
                metadata={
                    "region": region,
                    "batch_index": batch_index,
                    "batch_count": len(batches),
                    **(metadata or {}),
                },
            )
        )
    return normalize_metar_observations(
        rows,
        region=region,
        stations=stations,
        source_updated_at=datetime.utcnow(),
    )


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
    region: str = DEFAULT_REGION,
    stations: Mapping[str, str] | None = None,
    hours: int = DEFAULT_HOURS,
    database: str | None = None,
    run_mode: str = "manual",
    metadata: dict | None = None,
) -> pd.DataFrame | None:
    """Pull and upsert NOAA AviationWeather METAR rows for one station basket."""
    region = region.upper()
    station_map = dict(stations or STATION_BASKETS[region])
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
        run_logger.info(f"Station count: {len(station_map)}")
        run_logger.info(f"Lookback hours: {hours}")
        df = _pull(
            region=region,
            stations=station_map,
            hours=hours,
            run_id=run_id,
            database=database,
            metadata={"run_mode": run_mode, **(metadata or {})},
        )
        if df.empty:
            run_logger.section("No NOAA METAR rows returned; skipping upsert.")
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


def _parse_observation_time(row: dict) -> pd.Timestamp | None:
    obs_time = row.get("obsTime")
    if obs_time is not None:
        parsed_epoch = pd.to_numeric(obs_time, errors="coerce")
        if pd.notna(parsed_epoch):
            return pd.to_datetime(int(parsed_epoch), unit="s", utc=True)
    return _parse_datetime(row.get("reportTime"))


def _batched(values: list[str], batch_size: int) -> list[list[str]]:
    return [
        values[index : index + batch_size]
        for index in range(0, len(values), batch_size)
    ]


def _parse_datetime(value: object) -> pd.Timestamp | None:
    if value in (None, ""):
        return None
    parsed = pd.to_datetime(value, errors="coerce", utc=True)
    if pd.isna(parsed):
        return None
    return parsed


def _number(value: object) -> float | None:
    if value in (None, "", "M"):
        return None
    parsed = pd.to_numeric(value, errors="coerce")
    if pd.isna(parsed):
        return None
    return float(parsed)


def _c_to_f(value: float | None) -> float | None:
    if value is None:
        return None
    return round((value * 9 / 5) + 32, 2)


def _knots_to_mph(value: float | None) -> float | None:
    if value is None:
        return None
    return round(value * 1.15077945, 2)


def _relative_humidity(temp_c: float | None, dew_point_c: float | None) -> float | None:
    if temp_c is None or dew_point_c is None:
        return None
    numerator = math.exp((17.625 * dew_point_c) / (243.04 + dew_point_c))
    denominator = math.exp((17.625 * temp_c) / (243.04 + temp_c))
    return round(max(0.0, min(100.0, 100 * numerator / denominator)), 2)


def _feels_like_f(
    *,
    temp_f: float | None,
    wind_speed_mph: float | None,
    relative_humidity_pct: float | None,
) -> float | None:
    if temp_f is None:
        return None
    if temp_f <= 50 and wind_speed_mph is not None and wind_speed_mph > 3:
        wind_chill = (
            35.74
            + 0.6215 * temp_f
            - 35.75 * (wind_speed_mph**0.16)
            + 0.4275 * temp_f * (wind_speed_mph**0.16)
        )
        return round(wind_chill, 2)
    if temp_f >= 80 and relative_humidity_pct is not None:
        rh = relative_humidity_pct
        heat_index = (
            -42.379
            + 2.04901523 * temp_f
            + 10.14333127 * rh
            - 0.22475541 * temp_f * rh
            - 0.00683783 * temp_f * temp_f
            - 0.05481717 * rh * rh
            + 0.00122874 * temp_f * temp_f * rh
            + 0.00085282 * temp_f * rh * rh
            - 0.00000199 * temp_f * temp_f * rh * rh
        )
        return round(max(temp_f, heat_index), 2)
    return temp_f


def _visibility_miles(value: object) -> float | None:
    if value in (None, "", "M"):
        return None
    text = str(value).strip().replace("+", "")
    if text.startswith("M"):
        text = text[1:]
    if " " in text:
        whole, fraction = text.split(" ", 1)
        return (_number(whole) or 0) + (_fraction_to_float(fraction) or 0)
    fraction_value = _fraction_to_float(text)
    if fraction_value is not None:
        return fraction_value
    return _number(text)


def _fraction_to_float(value: str) -> float | None:
    if "/" not in value:
        return None
    numerator, denominator = value.split("/", 1)
    numerator_value = _number(numerator)
    denominator_value = _number(denominator)
    if numerator_value is None or not denominator_value:
        return None
    return numerator_value / denominator_value


if __name__ == "__main__":
    main()
