"""SPP hourly load, solar, and wind forecasts from Meteologica."""

from __future__ import annotations

from datetime import datetime
from pathlib import Path

import pandas as pd

from backend.scrapes.power.meteologica import forecast_hourly as common

API_SCRAPE_NAME = "spp_meteologica_forecast_hourly"
SOURCE_SYSTEM = common.SOURCE_SYSTEM
TARGET_SCHEMA = common.TARGET_SCHEMA
TARGET_TABLE = "spp_forecast_hourly"
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
        2927,
        "USA SPP power demand forecast Meteologica hourly",
        METRIC_LOAD,
        "SPP",
        "SPP",
        "usa_spp_power_demand_forecast_hourly",
    ),
    MeteologicaForecastFeed(
        2831,
        "USA SPP photovoltaic power generation forecast Meteologica hourly",
        METRIC_SOLAR,
        "SPP",
        "SPP",
        "usa_spp_pv_power_generation_forecast_hourly",
    ),
    MeteologicaForecastFeed(
        2856,
        "USA SPP wind power generation forecast Meteologica hourly",
        METRIC_WIND,
        "SPP",
        "SPP",
        "usa_spp_wind_power_generation_forecast_hourly",
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
    """Pull and upsert all configured SPP Meteologica hourly forecast feeds."""
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
