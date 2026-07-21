"""Orchestrate WSI hourly observed weather refreshes."""

from __future__ import annotations

import logging
from collections.abc import Mapping
from datetime import datetime
from typing import Any

import pandas as pd

from backend.orchestration.weather.wsi._completeness import station_coverage
from backend.scrapes.weather.wsi import hourly_observed as scrape
from backend.scrapes.weather.wsi.stations import STATION_BASKETS
from backend.utils.data_availability import emit_data_availability_event

API_SCRAPE_NAME = scrape.API_SCRAPE_NAME
TARGET_TABLE_FQN = scrape.TARGET_TABLE_FQN
DATASET_NAME = "weather_wsi_hourly_observed_temperatures"
DATA_SOURCE_SYSTEM = "wsi"
DATA_AVAILABILITY_TYPE = "freshness_observed"
DATA_GRAIN = "station_hour_local"
DEFAULT_REGION = scrape.DEFAULT_REGION

logger = logging.getLogger(__name__)


def main(
    *,
    start_date: datetime | None = None,
    end_date: datetime | None = None,
    region: str = DEFAULT_REGION,
    database: str | None = None,
    run_mode: str = "scheduled",
    metadata: dict[str, Any] | None = None,
) -> pd.DataFrame | None:
    """Run the WSI observed refresh and emit a freshness event."""
    df = scrape.main(
        start_date=start_date,
        end_date=end_date,
        region=region,
        database=database,
        run_mode=run_mode,
        metadata=metadata,
    )
    if df is None or df.empty:
        logger.info("No WSI observed rows available for freshness emission")
        return df

    event = _emit_freshness_event(
        df=df,
        region=region,
        database=database,
    )
    status = "created" if event.get("created") else "already existed"
    logger.info("Data availability event %s %s.", event["event_key"], status)
    return df


def _emit_freshness_event(
    *,
    df: pd.DataFrame,
    region: str,
    database: str | None,
    expected_stations: Mapping[str, str] | None = None,
) -> dict[str, Any]:
    current_df = df.copy()
    current_df["observation_time_local"] = pd.to_datetime(
        current_df["observation_time_local"],
        errors="coerce",
    )
    latest = current_df["observation_time_local"].max()
    if pd.isna(latest):
        raise ValueError("Cannot emit WSI freshness; observation_time_local is empty")

    station_count = int(current_df["station_id"].nunique())
    row_count = int(len(current_df))
    business_date = pd.Timestamp(latest).date()
    expected_station_map = expected_stations or STATION_BASKETS.get(region, {})
    coverage = station_coverage(current_df, expected_stations=expected_station_map)
    latest_by_station = (
        current_df.dropna(subset=["observation_time_local"])
        .groupby("station_id")["observation_time_local"]
        .max()
        .sort_index()
    )
    payload = {
        "region": region,
        "latest_observation_time_local": pd.Timestamp(latest).isoformat(),
        "station_count": station_count,
        "completeness_basis": "expected_station_presence_in_returned_window",
        **coverage.as_payload(),
        "station_latest_observation_time_local": {
            str(station_id): pd.Timestamp(value).isoformat()
            for station_id, value in latest_by_station.items()
        },
        "window_min": pd.Timestamp(current_df["observation_time_local"].min()).isoformat(),
        "window_max": pd.Timestamp(latest).isoformat(),
    }
    event_key = (
        f"{DATASET_NAME}:{DATA_AVAILABILITY_TYPE}:"
        f"{region}:{pd.Timestamp(latest).strftime('%Y%m%d%H')}"
    )
    return emit_data_availability_event(
        event_key=event_key,
        dataset=DATASET_NAME,
        source_system=DATA_SOURCE_SYSTEM,
        availability_type=DATA_AVAILABILITY_TYPE,
        business_date=business_date,
        window_start=None,
        window_end=None,
        scope=region,
        grain=DATA_GRAIN,
        source_table=TARGET_TABLE_FQN,
        row_count=row_count,
        entity_count=station_count,
        period_count=int(current_df["observation_time_local"].nunique()),
        completeness_status=coverage.status,
        run_id=None,
        payload=payload,
        database=database,
    )


if __name__ == "__main__":
    main()
