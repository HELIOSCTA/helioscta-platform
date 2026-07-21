"""WSI Trader daily weighted temperature forecasts."""

from __future__ import annotations

import csv
import logging
import re
import time
from collections.abc import Iterable
from datetime import date, datetime
from io import StringIO
from pathlib import Path
from uuid import uuid4

import pandas as pd

from backend import credentials
from backend.scrapes.weather.wsi import _daily_weighted_common as common
from backend.scrapes.weather.wsi import client
from backend.utils import db, script_logging
from backend.utils.ops_logging import redact_secrets

API_SCRAPE_NAME = "wsi_daily_weighted_temperature_forecasts"
SOURCE_SYSTEM = "wsi"
SOURCE_PRODUCT_ID = "WEIGHTED_TEMPERATURE_FORECAST"
TARGET_SCHEMA = "weather"
TARGET_TABLE = "wsi_daily_weighted_temperature_forecasts"
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
    "https://www.wsitrader.com/Services/CSVDownloadService.svc/GetModelForecast"
)
DEFAULT_REQUEST_REGION = "NA"
DEFAULT_ENTITY_IDS = ["PJM"]
DEFAULT_FORECAST_TYPE = "Daily"
DEFAULT_MODEL = "WSI"
DEFAULT_TEMP_UNITS = "F"
DEFAULT_BIAS_CORRECTED = False
DEFAULT_ALL_REGIONS = True
DEFAULT_SHOW_DIFFERENCES = False
DEFAULT_RETENTION_DAYS = 90
EXPECTED_METRIC_NAMES = [
    "min_temp_f",
    "max_temp_f",
    "hdd",
    "cdd",
    "heat_index_f",
]
METRIC_UNITS = {
    "min_temp_f": "fahrenheit",
    "max_temp_f": "fahrenheit",
    "hdd": "degree_day_f",
    "cdd": "degree_day_f",
    "heat_index_f": "fahrenheit",
}
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
    "temp_units",
    "bias_corrected",
    "all_regions",
    "forecast_period",
    "forecast_date",
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
    "VARCHAR",
    "BOOLEAN",
    "BOOLEAN",
    "VARCHAR",
    "DATE",
    "VARCHAR",
    "DOUBLE PRECISION",
    "VARCHAR",
]

_PERIOD_DATE_RE = re.compile(
    r"^(?P<period>Day\s+\d+)\s*-\s*(?P<date>\d{1,2}/\d{1,2}/\d{4})$",
    re.IGNORECASE,
)

logger = logging.getLogger(__name__)


def parse_daily_weighted_temperature_forecast_text(
    text: str,
    *,
    request_region: str = DEFAULT_REQUEST_REGION,
    entity_ids: Iterable[str] | None = None,
    model: str = DEFAULT_MODEL,
    forecast_type: str = DEFAULT_FORECAST_TYPE,
    temp_units: str = DEFAULT_TEMP_UNITS,
    bias_corrected: bool = DEFAULT_BIAS_CORRECTED,
    all_regions: bool = DEFAULT_ALL_REGIONS,
    scrape_run_at_utc: datetime | None = None,
) -> pd.DataFrame:
    """Normalize WSI GetModelForecast text into long-form daily metric rows."""
    scrape_run_at_utc = scrape_run_at_utc or common.utc_now()
    source_banner = common.first_nonempty_line(text)
    source_issue_at_utc = common.parse_source_issue_at_utc(source_banner)
    issue_key = common.source_issue_key(
        endpoint_name="GetModelForecast",
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
    requested_entities = {
        str(entity_id).strip().upper()
        for entity_id in (entity_ids or DEFAULT_ENTITY_IDS)
        if str(entity_id).strip()
    }

    records: list[dict[str, object]] = []
    blocks = list(_iter_temperature_blocks(text))
    if not blocks:
        raise ValueError("No WSI daily weighted temperature forecast blocks found.")

    for block in blocks:
        entity_id = str(block["entity_id"])
        if requested_entities and entity_id.upper() not in requested_entities:
            continue

        metric_names = [_metric_name(metric) for metric in block["metrics"]]
        for row in block["rows"]:
            forecast_period, forecast_date = _parse_period_date(row[0])
            expected_field_count = 1 + len(metric_names)
            if len(row) < expected_field_count:
                raise ValueError(
                    "WSI temperature row for "
                    f"{entity_id} {row[0]!r} has {len(row) - 1} metric values; "
                    f"expected {len(metric_names)}."
                )
            extra_values = row[expected_field_count:]
            if any(str(value).strip() for value in extra_values):
                raise ValueError(
                    "WSI temperature row for "
                    f"{entity_id} {row[0]!r} has unexpected extra values: "
                    f"{extra_values}"
                )
            values = row[1:expected_field_count]
            for metric_name, raw_value in zip(metric_names, values):
                if not metric_name:
                    continue
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
                        "entity_id": entity_id,
                        "model": model,
                        "forecast_type": forecast_type,
                        "temp_units": temp_units,
                        "bias_corrected": bias_corrected,
                        "all_regions": all_regions,
                        "forecast_period": forecast_period,
                        "forecast_date": forecast_date,
                        "metric_name": metric_name,
                        "metric_value": common.numeric_value(raw_value),
                        "metric_unit": METRIC_UNITS.get(metric_name),
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
    entity_ids: Iterable[str] | None = None,
    model: str = DEFAULT_MODEL,
    forecast_type: str = DEFAULT_FORECAST_TYPE,
    temp_units: str = DEFAULT_TEMP_UNITS,
    bias_corrected: bool = DEFAULT_BIAS_CORRECTED,
    all_regions: bool = DEFAULT_ALL_REGIONS,
    show_differences: bool = DEFAULT_SHOW_DIFFERENCES,
    run_id: str | None = None,
    database: str | None = None,
    scrape_run_at_utc: datetime | None = None,
    metadata: dict | None = None,
) -> pd.DataFrame:
    scrape_run_at_utc = scrape_run_at_utc or common.utc_now()
    selected_entities = list(entity_ids or DEFAULT_ENTITY_IDS)
    params = {
        "Region": request_region,
        "ForecastType": forecast_type,
        "Model": model,
        "TempUnits": temp_units,
        "BiasCorrected": _bool_param(bias_corrected),
        "allregions": _bool_param(all_regions),
        "ShowDifferences": _bool_param(show_differences),
    }
    logger.info(
        "wsi_request: %s",
        client.sanitized_request_context(DEFAULT_BASE_URL, params),
    )
    fetch_metadata = {
        "request_region": request_region,
        "entity_ids": selected_entities,
        "model": model,
        "forecast_type": forecast_type,
        "temp_units": temp_units,
        "bias_corrected": bias_corrected,
        "all_regions": all_regions,
        "show_differences": show_differences,
        **(metadata or {}),
    }
    text = client._HTTP_CLIENT.get_text(
        base_url=DEFAULT_BASE_URL,
        params=params,
        pipeline_name=API_SCRAPE_NAME,
        operation_name="GetModelForecast",
        target_table=TARGET_TABLE_FQN,
        run_id=run_id,
        feed_name=API_SCRAPE_NAME,
        database=database,
        metadata=fetch_metadata,
    )
    parse_started_at = time.perf_counter()
    try:
        return parse_daily_weighted_temperature_forecast_text(
            text,
            request_region=request_region,
            entity_ids=selected_entities,
            model=model,
            forecast_type=forecast_type,
            temp_units=temp_units,
            bias_corrected=bias_corrected,
            all_regions=all_regions,
            scrape_run_at_utc=scrape_run_at_utc,
        )
    except Exception as exc:
        client.log_wsi_fetch_event(
            base_url=DEFAULT_BASE_URL,
            pipeline_name=API_SCRAPE_NAME,
            operation_name="GetModelForecast",
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
                "parse_daily_weighted_temperature_csv",
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
    entity_ids: Iterable[str] | None = None,
    model: str = DEFAULT_MODEL,
    forecast_type: str = DEFAULT_FORECAST_TYPE,
    temp_units: str = DEFAULT_TEMP_UNITS,
    bias_corrected: bool = DEFAULT_BIAS_CORRECTED,
    all_regions: bool = DEFAULT_ALL_REGIONS,
    show_differences: bool = DEFAULT_SHOW_DIFFERENCES,
    database: str | None = None,
    run_mode: str = "manual",
    metadata: dict | None = None,
) -> pd.DataFrame | None:
    """Pull and upsert WSI daily weighted temperature forecast rows."""
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
        fetch_metadata = {"run_mode": run_mode, **(metadata or {})}
        df = _pull(
            request_region=request_region,
            entity_ids=selected_entities,
            model=model,
            forecast_type=forecast_type,
            temp_units=temp_units,
            bias_corrected=bias_corrected,
            all_regions=all_regions,
            show_differences=show_differences,
            run_id=run_id,
            database=database,
            scrape_run_at_utc=scrape_run_at_utc,
            metadata=fetch_metadata,
        )
        if df.empty:
            run_logger.section(
                "No WSI daily weighted temperature forecast rows returned; "
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


def _iter_temperature_blocks(text: str) -> Iterable[dict[str, object]]:
    lines = [line.rstrip("\r") for line in text.splitlines()]
    index = 0
    while index < len(lines) and not lines[index].strip():
        index += 1
    index += 1

    while index < len(lines):
        while index < len(lines) and not lines[index].strip():
            index += 1
        if index >= len(lines):
            break

        entity_id = lines[index].strip().strip(",")
        index += 1
        if index >= len(lines):
            raise ValueError(f"WSI temperature block missing header for {entity_id}")

        header = lines[index].strip()
        index += 1
        if not header.startswith(","):
            raise ValueError(
                f"WSI temperature block has unexpected header for {entity_id}: "
                f"{header}"
            )
        metrics = _header_metrics(header)
        rows: list[list[str]] = []

        while index < len(lines):
            raw_line = lines[index].strip()
            index += 1
            if not raw_line:
                break

            fields = [field.strip() for field in next(csv.reader(StringIO(raw_line)))]
            first_field = fields[0] if fields else ""
            lower_first = first_field.lower()
            if lower_first == "total":
                continue
            if lower_first.startswith("day "):
                rows.append(fields)
                continue

            index -= 1
            break

        yield {"entity_id": entity_id, "metrics": metrics, "rows": rows}


def _header_metrics(header: str) -> list[str]:
    fields = [field.strip() for field in next(csv.reader(StringIO(header)))]
    return [field for field in fields[1:] if field]


def _parse_period_date(value: object) -> tuple[str, date]:
    match = _PERIOD_DATE_RE.match(str(value).strip())
    if not match:
        raise ValueError(f"Could not parse WSI forecast day/date value: {value}")
    forecast_date = datetime.strptime(match.group("date"), "%m/%d/%Y").date()
    return match.group("period").title(), forecast_date


def _metric_name(value: str) -> str:
    canonical = value.strip().lower()
    canonical = canonical.replace("/", " ")
    canonical = "_".join(canonical.split())
    metric_map = {
        "min_temp": "min_temp_f",
        "max_temp": "max_temp_f",
        "hdd": "hdd",
        "cdd": "cdd",
        "heat_index": "heat_index_f",
    }
    return metric_map.get(canonical, canonical)


def _bool_param(value: bool) -> str:
    return "true" if value else "false"


if __name__ == "__main__":
    main()
