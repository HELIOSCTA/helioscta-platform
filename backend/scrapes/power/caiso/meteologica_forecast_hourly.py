"""CAISO hourly load, solar, and wind forecasts from Meteologica."""

from __future__ import annotations

from datetime import datetime
from pathlib import Path

import pandas as pd

from backend.scrapes.power.meteologica import forecast_hourly as common

API_SCRAPE_NAME = "caiso_meteologica_forecast_hourly"
SOURCE_SYSTEM = common.SOURCE_SYSTEM
TARGET_SCHEMA = common.TARGET_SCHEMA
TARGET_TABLE = "caiso_forecast_hourly"
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
        1785,
        "USA CAISO power demand forecast Meteologica hourly",
        METRIC_LOAD,
        "CAISO",
        "CAISO",
        "usa_caiso_power_demand_forecast_hourly",
    ),
    MeteologicaForecastFeed(
        1717,
        "USA CAISO photovoltaic power generation forecast Meteologica hourly",
        METRIC_SOLAR,
        "CAISO",
        "CAISO",
        "usa_caiso_pv_power_generation_forecast_hourly",
    ),
    MeteologicaForecastFeed(
        1755,
        "USA CAISO wind power generation forecast Meteologica hourly",
        METRIC_WIND,
        "CAISO",
        "CAISO",
        "usa_caiso_wind_power_generation_forecast_hourly",
    ),
    MeteologicaForecastFeed(
        1788,
        "USA CAISO PGE power demand forecast Meteologica hourly",
        METRIC_LOAD,
        "CAISO",
        "PGE",
        "usa_caiso_pge_power_demand_forecast_hourly",
    ),
    MeteologicaForecastFeed(
        1791,
        "USA CAISO SCE power demand forecast Meteologica hourly",
        METRIC_LOAD,
        "CAISO",
        "SCE",
        "usa_caiso_sce_power_demand_forecast_hourly",
    ),
    MeteologicaForecastFeed(
        1790,
        "USA CAISO SDGE power demand forecast Meteologica hourly",
        METRIC_LOAD,
        "CAISO",
        "SDGE",
        "usa_caiso_sdge_power_demand_forecast_hourly",
    ),
    MeteologicaForecastFeed(
        1792,
        "USA CAISO VEA power demand forecast Meteologica hourly",
        METRIC_LOAD,
        "CAISO",
        "VEA",
        "usa_caiso_vea_power_demand_forecast_hourly",
    ),
    MeteologicaForecastFeed(
        1716,
        "USA CAISO NP15 photovoltaic power generation forecast Meteologica hourly",
        METRIC_SOLAR,
        "CAISO",
        "NP15",
        "usa_caiso_np15_pv_power_generation_forecast_hourly",
    ),
    MeteologicaForecastFeed(
        1757,
        "USA CAISO NP15 wind power generation forecast Meteologica hourly",
        METRIC_WIND,
        "CAISO",
        "NP15",
        "usa_caiso_np15_wind_power_generation_forecast_hourly",
    ),
    MeteologicaForecastFeed(
        1718,
        "USA CAISO SP15 photovoltaic power generation forecast Meteologica hourly",
        METRIC_SOLAR,
        "CAISO",
        "SP15",
        "usa_caiso_sp15_pv_power_generation_forecast_hourly",
    ),
    MeteologicaForecastFeed(
        1756,
        "USA CAISO SP15 wind power generation forecast Meteologica hourly",
        METRIC_WIND,
        "CAISO",
        "SP15",
        "usa_caiso_sp15_wind_power_generation_forecast_hourly",
    ),
    MeteologicaForecastFeed(
        1719,
        "USA CAISO ZP26 photovoltaic power generation forecast Meteologica hourly",
        METRIC_SOLAR,
        "CAISO",
        "ZP26",
        "usa_caiso_zp26_pv_power_generation_forecast_hourly",
    ),
    MeteologicaForecastFeed(
        6914,
        "USA CAISO ZP26 wind power generation forecast Meteologica hourly",
        METRIC_WIND,
        "CAISO",
        "ZP26",
        "usa_caiso_zp26_wind_power_generation_forecast_hourly",
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
    """Pull and upsert all configured CAISO Meteologica hourly forecast feeds."""
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
