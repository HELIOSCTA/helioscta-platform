"""ISO-NE public forecast CSV feeds."""
from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
import re
from uuid import uuid4

import pandas as pd
from dateutil.relativedelta import relativedelta

from backend import credentials
from backend.scrapes.power.isone import isone_api_utils as isone_api
from backend.utils import db, retention, script_logging


TARGET_DATABASE: str | None = None
TARGET_SCHEMA = "isone"
DEFAULT_DELTA = relativedelta(days=1)

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class ForecastFeedConfig:
    feed_name: str
    endpoint: str
    source_page: str
    primary_key: tuple[str, ...]
    parser: str
    numeric_columns: tuple[str, ...]
    text_columns: tuple[str, ...] = ()
    skiprows: tuple[int, ...] | None = None
    skipfooter: int = 1
    hot_retention_days: int = 90
    hot_retention_column: str = "forecast_execution_date"

    @property
    def target_table(self) -> str:
        return self.feed_name

    @property
    def target_table_fqn(self) -> str:
        return f"{TARGET_SCHEMA}.{self.target_table}"


CAPACITY_NUMERIC_COLUMNS = (
    "high_temperature_boston",
    "dew_point_boston",
    "high_temperature_hartford",
    "dew_point_hartford",
    "total_capacity_supply_obligation",
    "anticipated_cold_weather_outages",
    "other_generation_outages",
    "anticipated_de_list_mw_offered",
    "total_generation_available",
    "import_at_time_of_peak",
    "total_available_generation_and_imports",
    "projected_peak_load",
    "replacement_reserve_requirement",
    "required_reserve",
    "required_reserve_including_replacement",
    "total_load_plus_required_reserve",
    "projected_surplus_deficiency",
    "available_demand_response_resources",
)

FEED_CONFIGS: dict[str, ForecastFeedConfig] = {
    "three_day_reliability_region_demand_forecast": ForecastFeedConfig(
        feed_name="three_day_reliability_region_demand_forecast",
        endpoint="transform/csv/reliabilityregionloadforecast?start={date}",
        source_page=(
            "https://www.iso-ne.com/isoexpress/web/reports/load-and-demand/"
            "-/tree/three-day-reliability-region-demand-forecast"
        ),
        primary_key=(
            "published_date",
            "forecast_date",
            "hour_ending",
            "reliability_region",
        ),
        parser="reliability_region_demand",
        numeric_columns=("mw", "percentage"),
        hot_retention_column="published_date",
    ),
    "seven_day_capacity_forecast": ForecastFeedConfig(
        feed_name="seven_day_capacity_forecast",
        endpoint="transform/csv/sdf?start={date}",
        source_page=(
            "https://www.iso-ne.com/markets-operations/system-forecast-status/"
            "seven-day-capacity-forecast"
        ),
        primary_key=("forecast_execution_date", "date"),
        parser="capacity",
        numeric_columns=CAPACITY_NUMERIC_COLUMNS,
        text_columns=(
            "power_watch",
            "power_warning",
            "cold_weather_watch",
            "cold_weather_warning",
            "cold_weather_event",
        ),
        skiprows=(0, 1, 2, 3, 4, 5, 7, 12, 27, 28),
    ),
    "seven_day_wind_forecast": ForecastFeedConfig(
        feed_name="seven_day_wind_forecast",
        endpoint="transform/csv/wphf?start={date}",
        source_page=(
            "https://www.iso-ne.com/isoexpress/web/reports/operations/"
            "-/tree/seven-day-wind-power-forecast"
        ),
        primary_key=("forecast_execution_date", "forecast_date", "hour_ending"),
        parser="hourly_generation_forecast",
        numeric_columns=("wind_forecast_mw",),
        skiprows=(0, 1, 2, 3, 4, 5),
        hot_retention_column="forecast_execution_date",
    ),
    "seven_day_solar_forecast": ForecastFeedConfig(
        feed_name="seven_day_solar_forecast",
        endpoint="transform/csv/sphf?start={date}",
        source_page=(
            "https://www.iso-ne.com/isoexpress/web/reports/operations/"
            "-/tree/seven-day-solar-power-forecast"
        ),
        primary_key=("forecast_execution_date", "forecast_date", "hour_ending"),
        parser="hourly_generation_forecast",
        numeric_columns=("solar_forecast_mw",),
        skiprows=(0, 1, 2, 3, 4, 5),
        hot_retention_column="forecast_execution_date",
    ),
}


def _resolve_default_start_date() -> datetime:
    return datetime.now() - relativedelta(days=1)


def _resolve_default_end_date() -> datetime:
    return datetime.now()


def _build_url(config: ForecastFeedConfig, start_date: datetime) -> str:
    endpoint = config.endpoint.format(date=start_date.strftime("%Y%m%d"))
    return f"{isone_api.ISONE_BASE_URL}/{endpoint}"


def _pull(
    *,
    config: ForecastFeedConfig,
    start_date: datetime,
    request_retries: int = 3,
    run_id: str | None = None,
    database: str | None = None,
    metadata: dict | None = None,
) -> pd.DataFrame:
    """Pull one ISO-NE forecast feed for one report date."""
    url = _build_url(config=config, start_date=start_date)
    response = isone_api.make_request(
        url,
        logger=logger,
        retries=request_retries,
        pipeline_name=config.feed_name,
        run_id=run_id,
        feed_name=config.feed_name,
        target_table=config.target_table_fqn,
        metadata={
            "report_date": start_date.strftime("%Y-%m-%d"),
            **(metadata or {}),
        },
        database=database,
    )
    df = isone_api.parse_csv_response(
        response,
        skiprows=list(config.skiprows) if config.skiprows else None,
        skipfooter=config.skipfooter,
    )
    return _format(df=df, config=config, start_date=start_date)


def _format(
    *,
    df: pd.DataFrame,
    config: ForecastFeedConfig,
    start_date: datetime,
) -> pd.DataFrame:
    if df.empty:
        return df

    if config.parser == "reliability_region_demand":
        formatted = _format_reliability_region_demand(df)
    elif config.parser == "capacity":
        formatted = _format_capacity(df=df, start_date=start_date)
    elif config.parser == "hourly_generation_forecast":
        value_column = config.numeric_columns[0]
        formatted = _format_hourly_generation_forecast(
            df=df,
            start_date=start_date,
            value_column=value_column,
        )
    else:
        raise ValueError(f"Unsupported ISO-NE forecast parser: {config.parser}")

    formatted.drop_duplicates(subset=list(config.primary_key), keep="last", inplace=True)
    formatted.sort_values(list(config.primary_key), inplace=True)
    formatted.reset_index(drop=True, inplace=True)
    return formatted


def _format_reliability_region_demand(df: pd.DataFrame) -> pd.DataFrame:
    df = _normalize_columns(df)
    if "h" in df.columns:
        df = df[df["h"].astype(str).str.strip().eq("D")].copy()
        df.drop(columns=["h"], inplace=True)
    df.rename(columns={"%": "percentage", "hour": "hour_ending"}, inplace=True)
    df["published_date"] = pd.to_datetime(df["published_date"])
    df["forecast_date"] = pd.to_datetime(df["forecast_date"]).dt.date
    df["hour_ending"] = pd.to_numeric(df["hour_ending"], errors="raise").astype(int)
    df["reliability_region"] = df["reliability_region"].astype(str).str.strip()
    df["mw"] = pd.to_numeric(df["mw"], errors="coerce")
    df["percentage"] = pd.to_numeric(df["percentage"], errors="coerce")
    return df[
        [
            "published_date",
            "forecast_date",
            "hour_ending",
            "reliability_region",
            "mw",
            "percentage",
        ]
    ].copy()


def _format_capacity(df: pd.DataFrame, start_date: datetime) -> pd.DataFrame:
    df = df.copy()
    drop_cols = [col for col in df.columns if str(col).strip().lower() == "d"]
    df.drop(columns=drop_cols, inplace=True, errors="ignore")
    df = df.set_index(df.columns[0]).T
    df.index.name = "date"
    df.reset_index(inplace=True)
    df.columns.name = None
    df.columns = [_normalize_column_name(col) for col in df.columns]
    df.rename(
        columns={
            "total_capacity_supply_obligation_cso": (
                "total_capacity_supply_obligation"
            ),
            "projected_surplus_or_deficiency": "projected_surplus_deficiency",
        },
        inplace=True,
    )
    df["date"] = pd.to_datetime(df["date"], errors="coerce").dt.date
    df.dropna(subset=["date"], inplace=True)
    df["forecast_execution_date"] = pd.to_datetime(start_date).date()
    for col in CAPACITY_NUMERIC_COLUMNS:
        if col in df.columns:
            df[col] = pd.to_numeric(df[col], errors="coerce")
    for col in [
        "power_watch",
        "power_warning",
        "cold_weather_watch",
        "cold_weather_warning",
        "cold_weather_event",
    ]:
        if col in df.columns:
            df[col] = df[col].astype(str).str.strip()
    ordered = [
        "forecast_execution_date",
        "date",
        *CAPACITY_NUMERIC_COLUMNS,
        "power_watch",
        "power_warning",
        "cold_weather_watch",
        "cold_weather_warning",
        "cold_weather_event",
    ]
    return df[[col for col in ordered if col in df.columns]].copy()


def _format_hourly_generation_forecast(
    *,
    df: pd.DataFrame,
    start_date: datetime,
    value_column: str,
) -> pd.DataFrame:
    df = _normalize_columns(df)
    if "h" in df.columns:
        df = df[df["h"].astype(str).str.strip().eq("D")].copy()
        df.drop(columns=["h"], inplace=True)
    forecast_dates: dict[str, object] = {}
    for column in df.columns:
        if not re.fullmatch(r"\d{2}_\d{2}_\d{4}", column):
            continue
        parsed = pd.to_datetime(column.replace("_", "/"), errors="coerce")
        if pd.notna(parsed):
            forecast_dates[column] = parsed.date()
    if not forecast_dates:
        raise ValueError("Missing forecast-date columns in ISO-NE generation forecast")

    hour_col = "hour_ending"
    value_rows = df[pd.to_numeric(df[hour_col], errors="coerce").notna()].copy()
    value_rows["hour_ending"] = pd.to_numeric(
        value_rows["hour_ending"],
        errors="raise",
    ).astype(int)

    records = []
    for _, row in value_rows.iterrows():
        for column, forecast_date in forecast_dates.items():
            records.append(
                {
                    "forecast_execution_date": pd.to_datetime(start_date).date(),
                    "forecast_date": forecast_date,
                    "hour_ending": int(row["hour_ending"]),
                    value_column: row.get(column),
                }
            )

    out = pd.DataFrame(records)
    out[value_column] = pd.to_numeric(out[value_column], errors="coerce")
    out.dropna(subset=["forecast_date", "hour_ending", value_column], inplace=True)
    return out


def _normalize_columns(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()
    df.columns = [_normalize_column_name(col) for col in df.columns]
    return df


def _normalize_column_name(value: object) -> str:
    column = str(value).strip().lower()
    replacements = {
        " - ": "_",
        " ": "_",
        "-": "_",
        "/": "_",
        "+": "plus",
        "(": "",
        ")": "",
        ".": "",
    }
    for old, new in replacements.items():
        column = column.replace(old, new)
    column = column.replace("__", "_").strip("_")
    return column


def _upsert(
    *,
    df: pd.DataFrame,
    config: ForecastFeedConfig,
    database: str | None = TARGET_DATABASE,
) -> None:
    if df.empty:
        logger.info("Skipping empty upsert into %s", config.target_table_fqn)
        return

    missing_keys = [col for col in config.primary_key if col not in df.columns]
    if missing_keys:
        raise ValueError(
            f"Missing primary key columns for {config.target_table_fqn}: "
            f"{missing_keys}"
        )

    db.upsert_dataframe(
        database=database,
        schema=TARGET_SCHEMA,
        table_name=config.target_table,
        df=df,
        columns=df.columns.tolist(),
        data_types=db.infer_sql_data_types(df=df),
        primary_key=list(config.primary_key),
    )


def main(
    feed_name: str,
    start_date: datetime | None = None,
    end_date: datetime | None = None,
    delta: relativedelta = DEFAULT_DELTA,
    database: str | None = None,
) -> pd.DataFrame | None:
    """Run one ISO-NE forecast feed scrape."""
    config = FEED_CONFIGS[feed_name]
    start_date = start_date or _resolve_default_start_date()
    end_date = end_date or _resolve_default_end_date()
    database = database or credentials.AZURE_POSTGRESQL_DB_NAME
    run_logger = script_logging.init_logging(
        name=feed_name,
        log_dir=script_logging.get_log_dir(Path(__file__).parent / "logs"),
        log_to_file=True,
        delete_if_no_errors=True,
    )
    run_id = str(uuid4())
    rows_processed = 0
    frames: list[pd.DataFrame] = []

    try:
        run_logger.header(feed_name)
        run_logger.info(f"Run ID: {run_id}")
        current_date = start_date
        while current_date <= end_date:
            run_logger.section(f"Pulling data for {current_date:%Y-%m-%d}...")
            df = _pull(
                config=config,
                start_date=current_date,
                run_id=run_id,
                database=database,
            )
            if df.empty:
                run_logger.section(f"No data returned for {current_date:%Y-%m-%d}.")
            else:
                run_logger.section(f"Upserting {len(df)} rows...")
                _upsert(df=df, config=config, database=database)
                rows_processed += len(df)
                frames.append(df)
                run_logger.success(
                    f"Successfully pulled and upserted data for "
                    f"{current_date:%Y-%m-%d}."
                )
            current_date += delta

        _purge_retention_if_configured(
            config=config,
            database=database,
            rows_processed=rows_processed,
            run_logger=run_logger,
        )
        run_logger.success(f"{feed_name} completed; {rows_processed} rows processed.")
    except Exception as exc:
        run_logger.exception(f"Pipeline failed: {exc}")
        raise
    finally:
        script_logging.close_logging()

    return pd.concat(frames, ignore_index=True) if frames else None


def _purge_retention_if_configured(
    *,
    config: ForecastFeedConfig,
    database: str | None,
    rows_processed: int,
    run_logger,
) -> int:
    if rows_processed == 0:
        run_logger.section("No rows processed; skipping retention purge.")
        return 0

    deleted_rows = retention.purge_rows_older_than(
        schema=TARGET_SCHEMA,
        table_name=config.target_table,
        timestamp_column=config.hot_retention_column,
        retention_days=config.hot_retention_days,
        database=database,
    )
    run_logger.section(
        "Retention purge removed "
        f"{deleted_rows} rows older than {config.hot_retention_days} days."
    )
    return deleted_rows
