"""NYISO hourly load, solar, and wind forecasts from Meteologica."""

from __future__ import annotations

from datetime import datetime
from pathlib import Path

import pandas as pd

from backend.scrapes.power.meteologica import forecast_hourly as common

API_SCRAPE_NAME = "nyiso_meteologica_forecast_hourly"
SOURCE_SYSTEM = common.SOURCE_SYSTEM
TARGET_SCHEMA = common.TARGET_SCHEMA
TARGET_TABLE = "nyiso_forecast_hourly"
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
        2475,
        "USA NYISO power demand forecast Meteologica hourly",
        METRIC_LOAD,
        "NYISO",
        "NYISO",
        "usa_nyiso_power_demand_forecast_hourly",
    ),
    MeteologicaForecastFeed(
        2541,
        "USA NYISO photovoltaic power generation forecast Meteologica hourly",
        METRIC_SOLAR,
        "NYISO",
        "NYISO",
        "usa_nyiso_pv_power_generation_forecast_hourly",
    ),
    MeteologicaForecastFeed(
        2430,
        "USA NYISO wind power generation forecast Meteologica hourly",
        METRIC_WIND,
        "NYISO",
        "NYISO",
        "usa_nyiso_wind_power_generation_forecast_hourly",
    ),
    MeteologicaForecastFeed(
        2486,
        "USA NYISO A-West power demand forecast Meteologica hourly",
        METRIC_LOAD,
        "NYISO",
        "A-West",
        "usa_nyiso_a_west_power_demand_forecast_hourly",
    ),
    MeteologicaForecastFeed(
        2431,
        "USA NYISO A-West wind power generation forecast Meteologica hourly",
        METRIC_WIND,
        "NYISO",
        "A-West",
        "usa_nyiso_a_west_wind_power_generation_forecast_hourly",
    ),
    MeteologicaForecastFeed(
        2479,
        "USA NYISO B-Genesee power demand forecast Meteologica hourly",
        METRIC_LOAD,
        "NYISO",
        "B-Genesee",
        "usa_nyiso_b_genesee_power_demand_forecast_hourly",
    ),
    MeteologicaForecastFeed(
        2432,
        "USA NYISO B-Genesee wind power generation forecast Meteologica hourly",
        METRIC_WIND,
        "NYISO",
        "B-Genesee",
        "usa_nyiso_b_genesee_wind_power_generation_forecast_hourly",
    ),
    MeteologicaForecastFeed(
        2476,
        "USA NYISO C-Central power demand forecast Meteologica hourly",
        METRIC_LOAD,
        "NYISO",
        "C-Central",
        "usa_nyiso_c_central_power_demand_forecast_hourly",
    ),
    MeteologicaForecastFeed(
        2433,
        "USA NYISO C-Central wind power generation forecast Meteologica hourly",
        METRIC_WIND,
        "NYISO",
        "C-Central",
        "usa_nyiso_c_central_wind_power_generation_forecast_hourly",
    ),
    MeteologicaForecastFeed(
        2483,
        "USA NYISO D-North power demand forecast Meteologica hourly",
        METRIC_LOAD,
        "NYISO",
        "D-North",
        "usa_nyiso_d_north_power_demand_forecast_hourly",
    ),
    MeteologicaForecastFeed(
        2435,
        "USA NYISO D-North wind power generation forecast Meteologica hourly",
        METRIC_WIND,
        "NYISO",
        "D-North",
        "usa_nyiso_d_north_wind_power_generation_forecast_hourly",
    ),
    MeteologicaForecastFeed(
        2481,
        "USA NYISO E-Mohawk Valley power demand forecast Meteologica hourly",
        METRIC_LOAD,
        "NYISO",
        "E-Mohawk Valley",
        "usa_nyiso_e_mohawk_valley_power_demand_forecast_hourly",
    ),
    MeteologicaForecastFeed(
        2434,
        "USA NYISO E-Mohawk Valley wind power generation forecast Meteologica hourly",
        METRIC_WIND,
        "NYISO",
        "E-Mohawk Valley",
        "usa_nyiso_e_mohawk_valley_wind_power_generation_forecast_hourly",
    ),
    MeteologicaForecastFeed(
        2477,
        "USA NYISO F-Capital power demand forecast Meteologica hourly",
        METRIC_LOAD,
        "NYISO",
        "F-Capital",
        "usa_nyiso_f_capital_power_demand_forecast_hourly",
    ),
    MeteologicaForecastFeed(
        2480,
        "USA NYISO G-Hudson Valley power demand forecast Meteologica hourly",
        METRIC_LOAD,
        "NYISO",
        "G-Hudson Valley",
        "usa_nyiso_g_hudson_valley_power_demand_forecast_hourly",
    ),
    MeteologicaForecastFeed(
        2484,
        "USA NYISO H-Millwood power demand forecast Meteologica hourly",
        METRIC_LOAD,
        "NYISO",
        "H-Millwood",
        "usa_nyiso_h_millwood_power_demand_forecast_hourly",
    ),
    MeteologicaForecastFeed(
        2478,
        "USA NYISO I-Dunwoodie power demand forecast Meteologica hourly",
        METRIC_LOAD,
        "NYISO",
        "I-Dunwoodie",
        "usa_nyiso_i_dunwoodie_power_demand_forecast_hourly",
    ),
    MeteologicaForecastFeed(
        2485,
        "USA NYISO J-New York City power demand forecast Meteologica hourly",
        METRIC_LOAD,
        "NYISO",
        "J-New York City",
        "usa_nyiso_j_new_york_city_power_demand_forecast_hourly",
    ),
    MeteologicaForecastFeed(
        2482,
        "USA NYISO K-Long Island power demand forecast Meteologica hourly",
        METRIC_LOAD,
        "NYISO",
        "K-Long Island",
        "usa_nyiso_k_long_island_power_demand_forecast_hourly",
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
    """Pull and upsert all configured NYISO Meteologica hourly forecast feeds."""
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
