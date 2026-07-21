"""WSI Trader daily weighted observed temperatures."""

from __future__ import annotations

import csv
import logging
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

API_SCRAPE_NAME = "wsi_daily_weighted_temperature_observations"
SOURCE_SYSTEM = "wsi"
SOURCE_PRODUCT_ID = "HISTORICAL_WEIGHTED_TEMPERATURE"
TARGET_SCHEMA = "weather"
TARGET_TABLE = "wsi_daily_weighted_temperature_observations"
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
DEFAULT_ENTITY_IDS = ["PJM"]
DEFAULT_LOOKBACK_DAYS = 14
DEFAULT_TEMP_UNITS = "F"
DEFAULT_IS_DAILY = True
DEFAULT_IS_TEMP = True
DEFAULT_IS_DISPLAY_DATES = True
DEFAULT_DATA_TYPES = ["temperature"]
EXPECTED_METRIC_NAMES = [
    "min_temp_f",
    "max_temp_f",
    "avg_temp_f",
]
METRIC_UNITS = {
    "min_temp_f": "fahrenheit",
    "max_temp_f": "fahrenheit",
    "avg_temp_f": "fahrenheit",
}
OUTPUT_COLUMNS = [
    "source_product_id",
    "source_banner",
    "scrape_run_at_utc",
    "request_start_date",
    "request_end_date",
    "request_region",
    "entity_id",
    "entity_name",
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
    "VARCHAR",
    "BOOLEAN",
    "BOOLEAN",
    "BOOLEAN",
    "DATE",
    "VARCHAR",
    "DOUBLE PRECISION",
    "VARCHAR",
]

logger = logging.getLogger(__name__)


def _resolve_default_end_date() -> date:
    return datetime.now(timezone.utc).date()


def _resolve_default_start_date() -> date:
    return _resolve_default_end_date() - timedelta(days=DEFAULT_LOOKBACK_DAYS)


def parse_daily_weighted_temperature_observations_text(
    text: str,
    *,
    request_start_date: date | datetime | str | None = None,
    request_end_date: date | datetime | str | None = None,
    request_region: str = DEFAULT_REQUEST_REGION,
    entity_ids: Iterable[str] | None = None,
    temp_units: str = DEFAULT_TEMP_UNITS,
    is_daily: bool = DEFAULT_IS_DAILY,
    is_temp: bool = DEFAULT_IS_TEMP,
    is_display_dates: bool = DEFAULT_IS_DISPLAY_DATES,
    scrape_run_at_utc: datetime | None = None,
) -> pd.DataFrame:
    """Normalize WSI historical weighted-temperature text into long-form rows."""
    scrape_run_at_utc = scrape_run_at_utc or common.utc_now()
    source_banner = common.first_nonempty_line(text)
    start_date = _normalize_date(request_start_date) if request_start_date else None
    end_date = _normalize_date(request_end_date) if request_end_date else None
    requested_entities = {
        str(entity_id).strip().upper()
        for entity_id in (entity_ids or DEFAULT_ENTITY_IDS)
        if str(entity_id).strip()
    }

    csv_lines = [line for line in text.splitlines() if line.strip()]
    if len(csv_lines) < 3:
        raise ValueError("WSI weighted-temperature response missing CSV rows.")

    entity_row = _csv_fields(csv_lines[1])
    metric_row = _csv_fields(csv_lines[2])
    entity_ranges = _entity_metric_ranges(entity_row=entity_row, metric_row=metric_row)
    if not entity_ranges:
        raise ValueError("WSI weighted-temperature response has no entity columns.")

    records: list[dict[str, object]] = []
    for raw_line in csv_lines[3:]:
        row = _csv_fields(raw_line)
        if len(row) < len(metric_row):
            raise ValueError(
                "WSI weighted-temperature row has fewer fields than the metric "
                f"header: {row}"
            )
        if any(str(value).strip() for value in row[len(metric_row) :]):
            raise ValueError(
                "WSI weighted-temperature row has unexpected extra values: "
                f"{row[len(metric_row):]}"
            )

        observation_date = _parse_observation_date(row[0])
        for entity_id, entity_name, columns in entity_ranges:
            if requested_entities and entity_id.upper() not in requested_entities:
                continue
            for column_index, metric_name in columns:
                records.append(
                    {
                        "source_product_id": SOURCE_PRODUCT_ID,
                        "source_banner": source_banner,
                        "scrape_run_at_utc": pd.Timestamp(scrape_run_at_utc),
                        "request_start_date": start_date,
                        "request_end_date": end_date,
                        "request_region": request_region,
                        "entity_id": entity_id,
                        "entity_name": entity_name,
                        "temp_units": temp_units,
                        "is_daily": is_daily,
                        "is_temp": is_temp,
                        "is_display_dates": is_display_dates,
                        "observation_date": observation_date,
                        "metric_name": metric_name,
                        "metric_value": common.numeric_value(row[column_index]),
                        "metric_unit": METRIC_UNITS.get(metric_name),
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
    entity_ids: Iterable[str] | None = None,
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
    selected_entities = list(entity_ids or DEFAULT_ENTITY_IDS)
    start = _normalize_date(start_date)
    end = _normalize_date(end_date)
    params = {
        "StartDate": _wsi_date(start),
        "EndDate": _wsi_date(end),
        "CityIds[]": selected_entities,
        "HistoricalProductID": SOURCE_PRODUCT_ID,
        "DataTypes[]": DEFAULT_DATA_TYPES,
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
        "entity_ids": selected_entities,
        "historical_product_id": SOURCE_PRODUCT_ID,
        "data_types": DEFAULT_DATA_TYPES,
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
        return parse_daily_weighted_temperature_observations_text(
            text,
            request_start_date=start,
            request_end_date=end,
            request_region=request_region,
            entity_ids=selected_entities,
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
                "parse_daily_weighted_temperature_observations_csv",
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
    entity_ids: Iterable[str] | None = None,
    temp_units: str = DEFAULT_TEMP_UNITS,
    is_daily: bool = DEFAULT_IS_DAILY,
    is_temp: bool = DEFAULT_IS_TEMP,
    is_display_dates: bool = DEFAULT_IS_DISPLAY_DATES,
    database: str | None = None,
    run_mode: str = "manual",
    metadata: dict | None = None,
) -> pd.DataFrame | None:
    """Pull and upsert WSI daily weighted observed temperature rows."""
    start = _normalize_date(start_date) if start_date else _resolve_default_start_date()
    end = _normalize_date(end_date) if end_date else _resolve_default_end_date()
    database = database or credentials.AZURE_POSTGRESQL_DB_NAME
    selected_entities = list(entity_ids or DEFAULT_ENTITY_IDS)
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
        run_logger.info(f"Entities: {', '.join(selected_entities)}")
        run_logger.info(f"Window: {start:%Y-%m-%d} through {end:%Y-%m-%d}")
        fetch_metadata = {"run_mode": run_mode, **(metadata or {})}
        df = _pull(
            start_date=start,
            end_date=end,
            request_region=request_region,
            entity_ids=selected_entities,
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
                "No WSI daily weighted observed temperature rows returned; "
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


def _csv_fields(raw_line: str) -> list[str]:
    return [field.strip() for field in next(csv.reader(StringIO(raw_line)))]


def _entity_metric_ranges(
    *,
    entity_row: list[str],
    metric_row: list[str],
) -> list[tuple[str, str, list[tuple[int, str]]]]:
    starts = [
        index
        for index in range(1, max(len(entity_row), len(metric_row)))
        if index < len(entity_row) and entity_row[index].strip()
    ]
    ranges: list[tuple[str, str, list[tuple[int, str]]]] = []
    for position, start in enumerate(starts):
        end = starts[position + 1] if position + 1 < len(starts) else len(metric_row)
        entity_id, entity_name = _parse_entity_label(entity_row[start])
        columns = []
        for column_index in range(start, end):
            if column_index >= len(metric_row):
                break
            metric_name = _metric_name(metric_row[column_index])
            if metric_name:
                columns.append((column_index, metric_name))
        if columns:
            ranges.append((entity_id, entity_name, columns))
    return ranges


def _parse_entity_label(value: str) -> tuple[str, str]:
    parts = [part.strip() for part in value.split("-", maxsplit=1)]
    entity_id = parts[0]
    entity_name = parts[1] if len(parts) > 1 and parts[1] else entity_id
    if not entity_id:
        raise ValueError(f"Could not parse WSI weighted-temperature entity: {value}")
    return entity_id, entity_name


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


def _parse_observation_date(value: object) -> date:
    parsed = pd.to_datetime(str(value).strip(), errors="coerce")
    if pd.isna(parsed):
        raise ValueError(f"Could not parse WSI observation date value: {value}")
    return pd.Timestamp(parsed).date()


def _metric_name(value: str) -> str:
    canonical = value.strip().lower()
    canonical = canonical.replace("(", " ").replace(")", " ")
    canonical = "_".join(canonical.split())
    metric_map = {
        "min_f": "min_temp_f",
        "max_f": "max_temp_f",
        "avg_f": "avg_temp_f",
        "min": "min_temp_f",
        "max": "max_temp_f",
        "avg": "avg_temp_f",
    }
    return metric_map.get(canonical, canonical)


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
