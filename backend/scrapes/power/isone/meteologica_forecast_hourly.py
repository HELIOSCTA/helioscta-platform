"""ISO-NE hourly load, solar, and wind forecasts from Meteologica."""

from __future__ import annotations

from datetime import datetime
from pathlib import Path

import pandas as pd

from backend.scrapes.power.meteologica import forecast_hourly as common

API_SCRAPE_NAME = "isone_meteologica_forecast_hourly"
SOURCE_SYSTEM = common.SOURCE_SYSTEM
TARGET_SCHEMA = common.TARGET_SCHEMA
TARGET_TABLE = "isone_forecast_hourly"
TARGET_TABLE_FQN = f"{TARGET_SCHEMA}.{TARGET_TABLE}"
PRIMARY_KEY = common.PRIMARY_KEY
DEFAULT_RETENTION_DAYS = common.DEFAULT_RETENTION_DAYS

METRIC_LOAD = common.METRIC_LOAD
METRIC_SOLAR = common.METRIC_SOLAR
METRIC_WIND = common.METRIC_WIND
MeteologicaForecastFeed = common.MeteologicaForecastFeed
OUTPUT_COLUMNS = common.OUTPUT_COLUMNS
SQL_DATA_TYPES = common.SQL_DATA_TYPES
client = common.client
retention = common.retention

FEEDS: tuple[MeteologicaForecastFeed, ...] = (
    MeteologicaForecastFeed(
        2095,
        "USA ISO-NE power demand forecast Meteologica hourly",
        METRIC_LOAD,
        "ISONE",
        "ISONE",
        "usa_isone_power_demand_forecast_hourly",
    ),
    MeteologicaForecastFeed(
        2019,
        "USA ISO-NE photovoltaic power generation forecast Meteologica hourly",
        METRIC_SOLAR,
        "ISONE",
        "ISONE",
        "usa_isone_pv_power_generation_forecast_hourly",
    ),
    MeteologicaForecastFeed(
        2029,
        "USA ISO-NE wind power generation forecast Meteologica hourly",
        METRIC_WIND,
        "ISONE",
        "ISONE",
        "usa_isone_wind_power_generation_forecast_hourly",
    ),
    MeteologicaForecastFeed(
        2097,
        "USA ISO-NE Connecticut power demand forecast Meteologica hourly",
        METRIC_LOAD,
        "ISONE",
        "Connecticut",
        "usa_isone_connecticut_power_demand_forecast_hourly",
    ),
    MeteologicaForecastFeed(
        2031,
        "USA ISO-NE Connecticut wind power generation forecast Meteologica hourly",
        METRIC_WIND,
        "ISONE",
        "Connecticut",
        "usa_isone_connecticut_wind_power_generation_forecast_hourly",
    ),
    MeteologicaForecastFeed(
        2096,
        "USA ISO-NE Maine power demand forecast Meteologica hourly",
        METRIC_LOAD,
        "ISONE",
        "Maine",
        "usa_isone_maine_power_demand_forecast_hourly",
    ),
    MeteologicaForecastFeed(
        2034,
        "USA ISO-NE Maine wind power generation forecast Meteologica hourly",
        METRIC_WIND,
        "ISONE",
        "Maine",
        "usa_isone_maine_wind_power_generation_forecast_hourly",
    ),
    MeteologicaForecastFeed(
        2100,
        "USA ISO-NE NEMass power demand forecast Meteologica hourly",
        METRIC_LOAD,
        "ISONE",
        "NEMass",
        "usa_isone_nemass_power_demand_forecast_hourly",
    ),
    MeteologicaForecastFeed(
        2035,
        "USA ISO-NE NEMass wind power generation forecast Meteologica hourly",
        METRIC_WIND,
        "ISONE",
        "NEMass",
        "usa_isone_nemass_wind_power_generation_forecast_hourly",
    ),
    MeteologicaForecastFeed(
        2102,
        "USA ISO-NE New Hampshire power demand forecast Meteologica hourly",
        METRIC_LOAD,
        "ISONE",
        "New Hampshire",
        "usa_isone_new_hampshire_power_demand_forecast_hourly",
    ),
    MeteologicaForecastFeed(
        2030,
        "USA ISO-NE New Hampshire wind power generation forecast Meteologica hourly",
        METRIC_WIND,
        "ISONE",
        "New Hampshire",
        "usa_isone_new_hampshire_wind_power_generation_forecast_hourly",
    ),
    MeteologicaForecastFeed(
        2103,
        "USA ISO-NE Rhode Island power demand forecast Meteologica hourly",
        METRIC_LOAD,
        "ISONE",
        "Rhode Island",
        "usa_isone_rhode_island_power_demand_forecast_hourly",
    ),
    MeteologicaForecastFeed(
        2032,
        "USA ISO-NE Rhode Island wind power generation forecast Meteologica hourly",
        METRIC_WIND,
        "ISONE",
        "Rhode Island",
        "usa_isone_rhode_island_wind_power_generation_forecast_hourly",
    ),
    MeteologicaForecastFeed(
        2098,
        "USA ISO-NE SEMass power demand forecast Meteologica hourly",
        METRIC_LOAD,
        "ISONE",
        "SEMass",
        "usa_isone_semass_power_demand_forecast_hourly",
    ),
    MeteologicaForecastFeed(
        2036,
        "USA ISO-NE SEMass wind power generation forecast Meteologica hourly",
        METRIC_WIND,
        "ISONE",
        "SEMass",
        "usa_isone_semass_wind_power_generation_forecast_hourly",
    ),
    MeteologicaForecastFeed(
        2099,
        "USA ISO-NE Vermont power demand forecast Meteologica hourly",
        METRIC_LOAD,
        "ISONE",
        "Vermont",
        "usa_isone_vermont_power_demand_forecast_hourly",
    ),
    MeteologicaForecastFeed(
        2033,
        "USA ISO-NE Vermont wind power generation forecast Meteologica hourly",
        METRIC_WIND,
        "ISONE",
        "Vermont",
        "usa_isone_vermont_wind_power_generation_forecast_hourly",
    ),
    MeteologicaForecastFeed(
        2101,
        "USA ISO-NE WCMass power demand forecast Meteologica hourly",
        METRIC_LOAD,
        "ISONE",
        "WCMass",
        "usa_isone_wcmass_power_demand_forecast_hourly",
    ),
    MeteologicaForecastFeed(
        2037,
        "USA ISO-NE WCMass wind power generation forecast Meteologica hourly",
        METRIC_WIND,
        "ISONE",
        "WCMass",
        "usa_isone_wcmass_wind_power_generation_forecast_hourly",
    ),
)


def configured_feeds() -> tuple[MeteologicaForecastFeed, ...]:
    return FEEDS


def _pull_feed(
    feed: MeteologicaForecastFeed,
    *,
    run_id: str | None = None,
    database: str | None = None,
    metadata: dict | None = None,
) -> tuple[pd.DataFrame, dict]:
    return common.pull_feed(
        feed,
        pipeline_name=API_SCRAPE_NAME,
        target_table_fqn=TARGET_TABLE_FQN,
        run_id=run_id,
        database=database,
        metadata=metadata,
    )


def normalize_forecast_frame(
    df: pd.DataFrame,
    *,
    feed: MeteologicaForecastFeed,
    metadata: dict,
    scrape_run_at_utc: datetime,
) -> pd.DataFrame:
    return common.normalize_forecast_frame(
        df,
        feed=feed,
        metadata=metadata,
        scrape_run_at_utc=scrape_run_at_utc,
    )


def _pull(
    *,
    feeds: tuple[MeteologicaForecastFeed, ...] = FEEDS,
    run_id: str | None = None,
    database: str | None = None,
    scrape_run_at_utc: datetime | None = None,
    metadata: dict | None = None,
) -> pd.DataFrame:
    return common.pull_forecasts(
        feeds=feeds,
        pipeline_name=API_SCRAPE_NAME,
        target_table_fqn=TARGET_TABLE_FQN,
        run_id=run_id,
        database=database,
        scrape_run_at_utc=scrape_run_at_utc,
        metadata=metadata,
    )


def _upsert(df: pd.DataFrame, database: str | None = None) -> None:
    common.upsert_forecasts(
        df,
        target_schema=TARGET_SCHEMA,
        target_table=TARGET_TABLE,
        target_table_fqn=TARGET_TABLE_FQN,
        database=database,
    )


def _purge_old_rows(
    *,
    retention_days: int = DEFAULT_RETENTION_DAYS,
    database: str | None = None,
) -> int:
    return common.purge_old_forecasts(
        target_schema=TARGET_SCHEMA,
        target_table=TARGET_TABLE,
        retention_days=retention_days,
        database=database,
    )


def main(
    *,
    database: str | None = None,
    run_mode: str = "manual",
    feeds: tuple[MeteologicaForecastFeed, ...] = FEEDS,
    retention_days: int = DEFAULT_RETENTION_DAYS,
    metadata: dict | None = None,
) -> pd.DataFrame | None:
    """Pull and upsert all configured ISO-NE Meteologica hourly forecast feeds."""
    return common.run_forecast_scrape(
        pipeline_name=API_SCRAPE_NAME,
        feeds=feeds,
        target_schema=TARGET_SCHEMA,
        target_table=TARGET_TABLE,
        target_table_fqn=TARGET_TABLE_FQN,
        log_dir=Path(__file__).parent / "logs",
        database=database,
        run_mode=run_mode,
        retention_days=retention_days,
        metadata=metadata,
        pull_fn=_pull,
        upsert_fn=_upsert,
        purge_fn=_purge_old_rows,
    )


def _utc_now() -> datetime:
    return common.utc_now()


if __name__ == "__main__":
    main()
