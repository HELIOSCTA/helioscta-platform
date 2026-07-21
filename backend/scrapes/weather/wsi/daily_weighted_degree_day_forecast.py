"""WSI Trader daily weighted degree-day forecasts."""

from __future__ import annotations

import logging
import re
import time
from collections.abc import Iterable
from datetime import datetime
from io import StringIO
from pathlib import Path
from uuid import uuid4

import pandas as pd

from backend import credentials
from backend.scrapes.weather.wsi import _daily_weighted_common as common
from backend.scrapes.weather.wsi import client
from backend.utils import db, script_logging
from backend.utils.ops_logging import redact_secrets

API_SCRAPE_NAME = "wsi_daily_weighted_degree_day_forecasts"
SOURCE_SYSTEM = "wsi"
SOURCE_PRODUCT_ID = "WEIGHTED_DEGREE_DAY_FORECAST"
TARGET_SCHEMA = "weather"
TARGET_TABLE = "wsi_daily_weighted_degree_day_forecasts"
TARGET_TABLE_FQN = f"{TARGET_SCHEMA}.{TARGET_TABLE}"
PRIMARY_KEY = [
    "source_issue_key",
    "model",
    "forecast_type",
    "request_region",
    "entity_id",
    "forecast_date",
    "metric_name",
]
DEFAULT_BASE_URL = (
    "https://www.wsitrader.com/Services/CSVDownloadService.svc/"
    "GetWeightedDegreeDayForecast"
)
DEFAULT_REQUEST_REGION = "NA"
DEFAULT_FORECAST_TYPE = "Daily"
DEFAULT_MODEL = "WSI"
DEFAULT_BIAS_CORRECTED = False
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
DEFAULT_RETENTION_DAYS = 90
EXPECTED_METRIC_NAMES = [
    metric_name
    for data_type in DEFAULT_DATA_TYPES
    for metric_name in (
        data_type,
        f"{data_type}_normal_30yr",
        f"{data_type}_difference",
        f"{data_type}_dfn_30yr",
    )
]
OUTPUT_COLUMNS = [
    "source_issue_key",
    "source_issue_at_utc",
    "source_banner",
    "scrape_run_at_utc",
    "source_product_id",
    "request_region",
    "entity_id",
    "model",
    "forecast_type",
    "bias_corrected",
    "forecast_period",
    "forecast_date",
    "period_end_date",
    "metric_name",
    "metric_value",
    "metric_unit",
]
SQL_DATA_TYPES = [
    "VARCHAR",
    "TIMESTAMPTZ",
    "VARCHAR",
    "TIMESTAMPTZ",
    "VARCHAR",
    "VARCHAR",
    "VARCHAR",
    "VARCHAR",
    "VARCHAR",
    "BOOLEAN",
    "VARCHAR",
    "DATE",
    "DATE",
    "VARCHAR",
    "DOUBLE PRECISION",
    "VARCHAR",
]
IDENTIFIER_COLUMNS = {
    "site_id",
    "init_time",
    "period",
    "period_start",
    "period_end",
}

logger = logging.getLogger(__name__)


def parse_daily_weighted_degree_day_forecast_text(
    text: str,
    *,
    request_region: str = DEFAULT_REQUEST_REGION,
    model: str = DEFAULT_MODEL,
    forecast_type: str = DEFAULT_FORECAST_TYPE,
    bias_corrected: bool = DEFAULT_BIAS_CORRECTED,
    scrape_run_at_utc: datetime | None = None,
) -> pd.DataFrame:
    """Normalize WSI weighted degree-day text into long-form metric rows."""
    scrape_run_at_utc = scrape_run_at_utc or common.utc_now()
    source_banner = common.first_nonempty_line(text)
    source_issue_at_utc = common.parse_source_issue_at_utc(source_banner)
    issue_key = common.source_issue_key(
        endpoint_name="GetWeightedDegreeDayForecast",
        model=model,
        forecast_type=forecast_type,
        source_issue_at_utc=source_issue_at_utc,
        scrape_run_at_utc=scrape_run_at_utc,
    )
    source_context = {
        "source_issue_key": issue_key,
        "source_issue_at_utc": source_issue_at_utc,
        "source_banner": source_banner,
        "scrape_run_at_utc": scrape_run_at_utc,
    }

    csv_lines = [line for line in text.splitlines()[1:] if line.strip()]
    if not csv_lines:
        raise ValueError("WSI weighted degree-day response missing CSV rows.")
    try:
        source = pd.read_csv(StringIO("\n".join(csv_lines)))
    except pd.errors.EmptyDataError as exc:
        raise ValueError("WSI weighted degree-day response contained no CSV data.") from exc
    except pd.errors.ParserError as exc:
        raise ValueError(
            f"Failed to parse WSI weighted degree-day CSV response: {exc}"
        ) from exc

    normalized = source.copy()
    normalized.columns = [_canonical_column(column) for column in normalized.columns]
    missing = [
        column
        for column in ["site_id", "period", "period_start", "period_end"]
        if column not in normalized.columns
    ]
    if missing:
        raise ValueError(
            "WSI weighted degree-day response missing required columns. "
            f"Missing={missing}, Actual={normalized.columns.tolist()}"
        )

    metric_columns = [
        column for column in normalized.columns if column not in IDENTIFIER_COLUMNS
    ]
    if not metric_columns:
        raise ValueError("WSI weighted degree-day response has no metric columns.")
    if normalized.empty:
        return common.attach_source_context(
            pd.DataFrame(columns=OUTPUT_COLUMNS),
            **source_context,
        )

    records: list[dict[str, object]] = []
    for row in normalized.to_dict("records"):
        forecast_date = pd.to_datetime(row["period_start"], errors="coerce")
        period_end_date = pd.to_datetime(row["period_end"], errors="coerce")
        if pd.isna(forecast_date):
            raise ValueError(
                f"Could not parse WSI period_start value: {row['period_start']}"
            )
        if pd.isna(period_end_date):
            raise ValueError(f"Could not parse WSI period_end value: {row['period_end']}")

        for metric_name in metric_columns:
            records.append(
                {
                    "source_issue_key": issue_key,
                    "source_issue_at_utc": common.timestamp_or_nat(
                        source_issue_at_utc
                    ),
                    "source_banner": source_banner,
                    "scrape_run_at_utc": pd.Timestamp(scrape_run_at_utc),
                    "source_product_id": SOURCE_PRODUCT_ID,
                    "request_region": request_region,
                    "entity_id": str(row["site_id"]).strip(),
                    "model": model,
                    "forecast_type": forecast_type,
                    "bias_corrected": bias_corrected,
                    "forecast_period": str(row["period"]).strip(),
                    "forecast_date": pd.Timestamp(forecast_date).date(),
                    "period_end_date": pd.Timestamp(period_end_date).date(),
                    "metric_name": metric_name,
                    "metric_value": common.numeric_value(row[metric_name]),
                    "metric_unit": "degree_day_f",
                }
            )

    if not records:
        return common.attach_source_context(
            pd.DataFrame(columns=OUTPUT_COLUMNS),
            **source_context,
        )
    result = (
        pd.DataFrame(records, columns=OUTPUT_COLUMNS)
        .drop_duplicates(subset=PRIMARY_KEY, keep="last")
        .sort_values(PRIMARY_KEY)
        .reset_index(drop=True)
    )
    return common.attach_source_context(result, **source_context)


def _pull(
    *,
    request_region: str = DEFAULT_REQUEST_REGION,
    stations: Iterable[str] | None = None,
    data_types: Iterable[str] | None = None,
    model: str = DEFAULT_MODEL,
    forecast_type: str = DEFAULT_FORECAST_TYPE,
    bias_corrected: bool = DEFAULT_BIAS_CORRECTED,
    run_id: str | None = None,
    database: str | None = None,
    scrape_run_at_utc: datetime | None = None,
    metadata: dict | None = None,
) -> pd.DataFrame:
    scrape_run_at_utc = scrape_run_at_utc or common.utc_now()
    selected_stations = list(stations or DEFAULT_STATIONS)
    selected_data_types = list(data_types or DEFAULT_DATA_TYPES)
    params = {
        "Region": request_region,
        "ForecastType": forecast_type,
        "Model": model,
        "BiasCorrected": _bool_param(bias_corrected),
        "stations[]": selected_stations,
        "datatypes[]": selected_data_types,
    }
    logger.info(
        "wsi_request: %s",
        client.sanitized_request_context(DEFAULT_BASE_URL, params),
    )
    fetch_metadata = {
        "request_region": request_region,
        "stations": selected_stations,
        "data_types": selected_data_types,
        "model": model,
        "forecast_type": forecast_type,
        "bias_corrected": bias_corrected,
        **(metadata or {}),
    }
    text = client._HTTP_CLIENT.get_text(
        base_url=DEFAULT_BASE_URL,
        params=params,
        pipeline_name=API_SCRAPE_NAME,
        operation_name="GetWeightedDegreeDayForecast",
        target_table=TARGET_TABLE_FQN,
        run_id=run_id,
        feed_name=API_SCRAPE_NAME,
        database=database,
        metadata=fetch_metadata,
    )
    parse_started_at = time.perf_counter()
    try:
        return parse_daily_weighted_degree_day_forecast_text(
            text,
            request_region=request_region,
            model=model,
            forecast_type=forecast_type,
            bias_corrected=bias_corrected,
            scrape_run_at_utc=scrape_run_at_utc,
        )
    except Exception as exc:
        client.log_wsi_fetch_event(
            base_url=DEFAULT_BASE_URL,
            pipeline_name=API_SCRAPE_NAME,
            operation_name="GetWeightedDegreeDayForecast",
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
                "parse_daily_weighted_degree_day_csv",
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


def _purge_old_rows(
    *,
    retention_days: int = DEFAULT_RETENTION_DAYS,
    database: str | None = None,
) -> int:
    return common.purge_rows_older_than_source_issue_or_scrape(
        schema=TARGET_SCHEMA,
        table_name=TARGET_TABLE,
        retention_days=retention_days,
        database=database,
    )


def main(
    *,
    request_region: str = DEFAULT_REQUEST_REGION,
    stations: Iterable[str] | None = None,
    data_types: Iterable[str] | None = None,
    model: str = DEFAULT_MODEL,
    forecast_type: str = DEFAULT_FORECAST_TYPE,
    bias_corrected: bool = DEFAULT_BIAS_CORRECTED,
    database: str | None = None,
    run_mode: str = "manual",
    metadata: dict | None = None,
) -> pd.DataFrame | None:
    """Pull and upsert WSI daily weighted degree-day forecast rows."""
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
        fetch_metadata = {"run_mode": run_mode, **(metadata or {})}
        df = _pull(
            request_region=request_region,
            stations=selected_stations,
            data_types=selected_data_types,
            model=model,
            forecast_type=forecast_type,
            bias_corrected=bias_corrected,
            run_id=run_id,
            database=database,
            scrape_run_at_utc=scrape_run_at_utc,
            metadata=fetch_metadata,
        )
        if df.empty:
            run_logger.section(
                "No WSI daily weighted degree-day forecast rows returned; "
                "skipping upsert."
            )
        else:
            run_logger.section(f"Upserting {len(df)} rows...")
            _upsert(df, database=database)
            deleted_rows = _purge_old_rows(
                retention_days=DEFAULT_RETENTION_DAYS,
                database=database,
            )
            run_logger.section(
                "Retention purge removed "
                f"{deleted_rows} rows older than {DEFAULT_RETENTION_DAYS} days."
            )
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


def _bool_param(value: bool) -> str:
    return "true" if value else "false"


if __name__ == "__main__":
    main()
