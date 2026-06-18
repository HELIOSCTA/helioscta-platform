"""WSI Trader hourly forecasts."""

from __future__ import annotations

import csv
import logging
import re
from collections.abc import Iterable, Mapping
from datetime import UTC, datetime
from io import StringIO
from pathlib import Path
from uuid import uuid4

import pandas as pd

from backend import credentials
from backend.scrapes.weather.wsi import client
from backend.scrapes.weather.wsi.stations import STATION_BASKETS
from backend.utils import db, script_logging
from backend.utils.ops_logging import redact_secrets

API_SCRAPE_NAME = "wsi_hourly_forecasts"
SOURCE_SYSTEM = "wsi"
SOURCE_PRODUCT_ID = "HOURLY_FORECAST"
TARGET_SCHEMA = "weather"
TARGET_TABLE = "wsi_hourly_forecasts"
TARGET_TABLE_FQN = f"{TARGET_SCHEMA}.{TARGET_TABLE}"
PRIMARY_KEY = [
    "station_id",
    "region",
    "forecast_issued_at_utc",
    "forecast_time_utc",
]
DEFAULT_BASE_URL = (
    "https://www.wsitrader.com/Services/CSVDownloadService.svc/GetHourlyForecast"
)
DEFAULT_REGION = "PJM"
DEFAULT_WSI_REGION = "NA"
DEFAULT_TEMP_UNITS = "F"
DEFAULT_TIMEUTC = "true"
DEFAULT_BATCH_SIZE = 10
OUTPUT_COLUMNS = [
    "station_id",
    "station_name",
    "region",
    "forecast_issued_at_utc",
    "forecast_time_utc",
    "temp_f",
    "temp_diff_f",
    "temp_normal_f",
    "dew_point_f",
    "cloud_cover_pct",
    "feels_like_f",
    "feels_like_diff_f",
    "precip_in",
    "wind_dir_degrees",
    "wind_speed_mph",
    "ghi_irradiance",
    "probability_of_precip_pct",
    "relative_humidity_pct",
    "source_product_id",
    "source_banner",
    "scrape_run_at_utc",
]
SQL_DATA_TYPES = [
    "VARCHAR",
    "VARCHAR",
    "VARCHAR",
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
    "DOUBLE PRECISION",
    "VARCHAR",
    "VARCHAR",
    "TIMESTAMPTZ",
]

_FORECAST_ISSUE_RE = re.compile(
    r"Hourly Forecast Made (?P<issued>[A-Za-z]{3}\s+\d{1,2}\s+\d{4}\s+\d{4}) UTC",
    re.IGNORECASE,
)
_BANNER_STATION_RE = re.compile(r"^[A-Z]+-(?P<station_id>[^,\s]+)")

logger = logging.getLogger(__name__)


def normalize_hourly_forecast_frame(
    df: pd.DataFrame,
    *,
    region: str,
    station_id: str,
    station_name: str,
    source_banner: str,
    scrape_run_at_utc: datetime,
) -> pd.DataFrame:
    """Normalize one station's WSI hourly forecast CSV frame."""
    if df.empty:
        return pd.DataFrame(columns=OUTPUT_COLUMNS)

    forecast_issued_at_utc = _parse_forecast_issued_at_utc(source_banner)
    normalized = df.copy()
    normalized.columns = [_canonical_column(column) for column in normalized.columns]
    rename_map = {
        "utc_time": "forecast_time_utc",
        "localtime": "forecast_time_utc",
        "local_time": "forecast_time_utc",
        "temp": "temp_f",
        "tempdiff": "temp_diff_f",
        "temp_diff": "temp_diff_f",
        "tempnormal": "temp_normal_f",
        "temp_normal": "temp_normal_f",
        "dewpoint": "dew_point_f",
        "dew_point": "dew_point_f",
        "cloud_cover": "cloud_cover_pct",
        "feelsliketemp": "feels_like_f",
        "feels_like_temp": "feels_like_f",
        "feels_like": "feels_like_f",
        "feelsliketempdiff": "feels_like_diff_f",
        "feels_like_temp_diff": "feels_like_diff_f",
        "precip": "precip_in",
        "winddir": "wind_dir_degrees",
        "wind_dir": "wind_dir_degrees",
        "windspeed_mph": "wind_speed_mph",
        "wind_speed_mph": "wind_speed_mph",
        "ghirradiance": "ghi_irradiance",
        "ghi_irradiance": "ghi_irradiance",
        "pop": "probability_of_precip_pct",
        "relative_humidity_rh": "relative_humidity_pct",
        "relative_humidity": "relative_humidity_pct",
        "relativehumidity_rh": "relative_humidity_pct",
    }
    normalized.rename(
        columns={column: rename_map.get(column, column) for column in normalized.columns},
        inplace=True,
    )

    if "forecast_time_utc" not in normalized:
        raise ValueError(
            f"WSI hourly forecast frame missing UTC Time for {station_id}: "
            f"{df.columns.tolist()}"
        )

    normalized["station_id"] = station_id
    normalized["station_name"] = station_name
    normalized["region"] = region
    normalized["forecast_issued_at_utc"] = pd.Timestamp(forecast_issued_at_utc)
    normalized["forecast_time_utc"] = pd.to_datetime(
        normalized["forecast_time_utc"],
        errors="coerce",
        utc=True,
    )
    normalized = normalized.dropna(subset=["forecast_time_utc"]).copy()

    for column in [
        "temp_f",
        "temp_diff_f",
        "temp_normal_f",
        "dew_point_f",
        "cloud_cover_pct",
        "feels_like_f",
        "feels_like_diff_f",
        "precip_in",
        "wind_dir_degrees",
        "wind_speed_mph",
        "ghi_irradiance",
        "probability_of_precip_pct",
        "relative_humidity_pct",
    ]:
        if column not in normalized:
            normalized[column] = pd.NA
        normalized[column] = _numeric_series(normalized[column])

    normalized["source_product_id"] = SOURCE_PRODUCT_ID
    normalized["source_banner"] = source_banner
    normalized["scrape_run_at_utc"] = pd.Timestamp(scrape_run_at_utc)

    return (
        normalized[OUTPUT_COLUMNS]
        .drop_duplicates(subset=PRIMARY_KEY, keep="last")
        .sort_values(PRIMARY_KEY)
        .reset_index(drop=True)
    )


def parse_hourly_forecast_text(
    text: str,
    *,
    region: str,
    station_names: Mapping[str, str],
    scrape_run_at_utc: datetime,
) -> pd.DataFrame:
    """Parse one WSI hourly forecast response into normalized station rows."""
    frames: list[pd.DataFrame] = []
    for block in _iter_forecast_blocks(text):
        station_id = block["station_id"]
        if station_id not in station_names:
            logger.warning(
                "Skipping WSI hourly forecast block for unrequested station %s",
                station_id,
            )
            continue
        frames.append(
            normalize_hourly_forecast_frame(
                block["frame"],
                region=region,
                station_id=station_id,
                station_name=station_names[station_id],
                source_banner=block["source_banner"],
                scrape_run_at_utc=scrape_run_at_utc,
            )
        )

    if not frames:
        return pd.DataFrame(columns=OUTPUT_COLUMNS)
    return pd.concat(frames, ignore_index=True)


def _pull_batch(
    *,
    region: str,
    station_names: Mapping[str, str],
    run_id: str | None,
    database: str | None,
    scrape_run_at_utc: datetime,
    metadata: dict | None = None,
) -> pd.DataFrame:
    station_ids = list(station_names)
    params = {
        "region": DEFAULT_WSI_REGION,
        "SiteIds[]": station_ids,
        "TempUnits": DEFAULT_TEMP_UNITS,
        "timeutc": DEFAULT_TIMEUTC,
    }
    logger.info(
        "wsi_request: %s",
        client.sanitized_request_context(DEFAULT_BASE_URL, params),
    )
    text = client._HTTP_CLIENT.get_text(
        base_url=DEFAULT_BASE_URL,
        params=params,
        pipeline_name=API_SCRAPE_NAME,
        operation_name="GetHourlyForecast",
        target_table=TARGET_TABLE_FQN,
        run_id=run_id,
        feed_name=API_SCRAPE_NAME,
        database=database,
        metadata={
            "region": region,
            "station_ids": station_ids,
            **(metadata or {}),
        },
    )
    return parse_hourly_forecast_text(
        text,
        region=region,
        station_names=station_names,
        scrape_run_at_utc=scrape_run_at_utc,
    )


def _pull(
    *,
    region: str = DEFAULT_REGION,
    stations: Mapping[str, str] | None = None,
    run_id: str | None = None,
    database: str | None = None,
    scrape_run_at_utc: datetime | None = None,
    batch_size: int = DEFAULT_BATCH_SIZE,
    metadata: dict | None = None,
) -> pd.DataFrame:
    station_map = dict(stations or STATION_BASKETS[region])
    scrape_run_at_utc = scrape_run_at_utc or _utc_now()
    frames: list[pd.DataFrame] = []
    for station_ids in _chunked(station_map.keys(), batch_size):
        batch_station_names = {
            station_id: station_map[station_id] for station_id in station_ids
        }
        logger.info(
            "Pulling WSI hourly forecasts for %s stations: %s",
            region,
            ", ".join(station_ids),
        )
        frames.append(
            _pull_batch(
                region=region,
                station_names=batch_station_names,
                run_id=run_id,
                database=database,
                scrape_run_at_utc=scrape_run_at_utc,
                metadata=metadata,
            )
        )

    if not frames:
        return pd.DataFrame(columns=OUTPUT_COLUMNS)
    return (
        pd.concat(frames, ignore_index=True)
        .drop_duplicates(subset=PRIMARY_KEY, keep="last")
        .sort_values(PRIMARY_KEY)
        .reset_index(drop=True)
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
    database: str | None = None,
    run_mode: str = "manual",
    metadata: dict | None = None,
) -> pd.DataFrame | None:
    """Pull and upsert WSI hourly forecasts for one station basket."""
    database = database or credentials.AZURE_POSTGRESQL_DB_NAME
    run_logger = script_logging.init_logging(
        name=API_SCRAPE_NAME,
        log_dir=script_logging.get_log_dir(Path(__file__).parent / "logs"),
        log_to_file=True,
        delete_if_no_errors=True,
    )
    run_id = str(uuid4())
    scrape_run_at_utc = _utc_now()

    try:
        run_logger.header(API_SCRAPE_NAME)
        run_logger.info(f"Run ID: {run_id}")
        run_logger.info(f"Run mode: {run_mode}")
        run_logger.info(f"Region: {region}")
        fetch_metadata = {"run_mode": run_mode, **(metadata or {})}
        df = _pull(
            region=region,
            stations=stations,
            run_id=run_id,
            database=database,
            scrape_run_at_utc=scrape_run_at_utc,
            metadata=fetch_metadata,
        )
        if df.empty:
            run_logger.section("No WSI hourly forecast rows returned; skipping upsert.")
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


def _iter_forecast_blocks(text: str) -> Iterable[dict]:
    lines = [line for line in text.splitlines() if line.strip()]
    index = 0
    while index < len(lines):
        banner = lines[index].strip()
        if "Hourly Forecast Made" not in banner:
            index += 1
            continue

        station_id = _station_id_from_banner(banner)
        header_index = index + 1
        if header_index >= len(lines):
            raise ValueError(f"WSI hourly forecast block missing header: {banner}")
        header = lines[header_index].strip()
        data_lines: list[str] = []
        index = header_index + 1
        while index < len(lines) and "Hourly Forecast Made" not in lines[index]:
            data_lines.append(lines[index])
            index += 1

        if not data_lines:
            logger.warning("WSI hourly forecast block has no rows: %s", banner)
            continue

        csv_text = "\n".join([header, *data_lines])
        frame = pd.DataFrame(csv.DictReader(StringIO(csv_text)))
        yield {
            "station_id": station_id,
            "source_banner": banner,
            "frame": frame,
        }


def _station_id_from_banner(source_banner: str) -> str:
    match = _BANNER_STATION_RE.search(source_banner.strip())
    if not match:
        raise ValueError(f"Could not parse WSI station ID from banner: {source_banner}")
    return match.group("station_id").strip()


def _parse_forecast_issued_at_utc(source_banner: str) -> datetime:
    match = _FORECAST_ISSUE_RE.search(source_banner)
    if not match:
        raise ValueError(
            f"Could not parse WSI forecast issue timestamp from banner: {source_banner}"
        )
    issued = datetime.strptime(match.group("issued"), "%b %d %Y %H%M")
    return issued.replace(tzinfo=UTC)


def _chunked(values: Iterable[str], size: int) -> Iterable[list[str]]:
    if size < 1:
        raise ValueError("batch_size must be >= 1")
    chunk: list[str] = []
    for value in values:
        chunk.append(value)
        if len(chunk) == size:
            yield chunk
            chunk = []
    if chunk:
        yield chunk


def _canonical_column(column: object) -> str:
    value = str(column).strip().lower()
    value = value.replace("(", " ").replace(")", " ")
    return "_".join(value.split())


def _numeric_series(series: pd.Series) -> pd.Series:
    return pd.to_numeric(
        series.astype("string").str.strip().str.replace("%", "", regex=False),
        errors="coerce",
    )


def _utc_now() -> datetime:
    return datetime.now(tz=UTC).replace(microsecond=0)


if __name__ == "__main__":
    main()
