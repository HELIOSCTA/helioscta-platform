"""Orchestrate WSI hourly forecast refreshes."""

from __future__ import annotations

import logging
from collections.abc import Mapping
from typing import Any

import pandas as pd

from backend.orchestration.weather.wsi._completeness import station_coverage
from backend.scrapes.weather.wsi import hourly_forecast as scrape
from backend.scrapes.weather.wsi.stations import STATION_BASKETS
from backend.utils.data_availability import emit_data_availability_event

API_SCRAPE_NAME = scrape.API_SCRAPE_NAME
TARGET_TABLE_FQN = scrape.TARGET_TABLE_FQN
DATASET_NAME = "weather_wsi_hourly_forecasts"
DATA_SOURCE_SYSTEM = "wsi"
DATA_AVAILABILITY_TYPE = "freshness_forecast"
DATA_GRAIN = "station_forecast_hour_utc"
DEFAULT_REGION = scrape.DEFAULT_REGION

logger = logging.getLogger(__name__)


def main(
    *,
    region: str = DEFAULT_REGION,
    database: str | None = None,
    run_mode: str = "scheduled",
    metadata: dict[str, Any] | None = None,
) -> pd.DataFrame | None:
    """Run the WSI hourly forecast refresh and emit a freshness event."""
    df = scrape.main(
        region=region,
        database=database,
        run_mode=run_mode,
        metadata=metadata,
    )
    if df is None or df.empty:
        logger.info("No WSI hourly forecast rows available for freshness emission")
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
    current_df["forecast_issued_at_utc"] = pd.to_datetime(
        current_df["forecast_issued_at_utc"],
        errors="coerce",
        utc=True,
    )
    current_df["forecast_time_utc"] = pd.to_datetime(
        current_df["forecast_time_utc"],
        errors="coerce",
        utc=True,
    )
    latest_issue = current_df["forecast_issued_at_utc"].max()
    if pd.isna(latest_issue):
        raise ValueError("Cannot emit WSI freshness; forecast_issued_at_utc is empty")

    station_count = int(current_df["station_id"].nunique())
    row_count = int(len(current_df))
    business_date = pd.Timestamp(latest_issue).date()
    expected_station_map = expected_stations or STATION_BASKETS.get(region, {})
    coverage = station_coverage(current_df, expected_stations=expected_station_map)
    forecast_period_counts = (
        current_df.dropna(subset=["forecast_time_utc"])
        .groupby("station_id")["forecast_time_utc"]
        .nunique()
        .sort_index()
    )
    station_forecast_period_counts = {
        str(station_id): int(period_count)
        for station_id, period_count in forecast_period_counts.items()
    }
    min_station_period_count = (
        min(station_forecast_period_counts.values())
        if station_forecast_period_counts
        else 0
    )
    max_station_period_count = (
        max(station_forecast_period_counts.values())
        if station_forecast_period_counts
        else 0
    )
    uniform_forecast_period_count = (
        bool(station_forecast_period_counts)
        and min_station_period_count == max_station_period_count
    )
    completeness_status = coverage.status
    if completeness_status == "complete" and not uniform_forecast_period_count:
        completeness_status = "partial"
    payload = {
        "region": region,
        "latest_forecast_issued_at_utc": pd.Timestamp(latest_issue).isoformat(),
        "station_count": station_count,
        "completeness_basis": (
            "expected_station_presence_and_uniform_forecast_period_count"
        ),
        **coverage.as_payload(),
        "station_forecast_period_counts": station_forecast_period_counts,
        "min_station_period_count": min_station_period_count,
        "max_station_period_count": max_station_period_count,
        "uniform_forecast_period_count": uniform_forecast_period_count,
        "forecast_time_min_utc": pd.Timestamp(
            current_df["forecast_time_utc"].min()
        ).isoformat(),
        "forecast_time_max_utc": pd.Timestamp(
            current_df["forecast_time_utc"].max()
        ).isoformat(),
    }
    event_key = (
        f"{DATASET_NAME}:{DATA_AVAILABILITY_TYPE}:"
        f"{region}:{pd.Timestamp(latest_issue).strftime('%Y%m%d%H%M')}"
    )
    return emit_data_availability_event(
        event_key=event_key,
        dataset=DATASET_NAME,
        source_system=DATA_SOURCE_SYSTEM,
        availability_type=DATA_AVAILABILITY_TYPE,
        business_date=business_date,
        window_start=pd.Timestamp(current_df["forecast_time_utc"].min()).to_pydatetime(),
        window_end=pd.Timestamp(current_df["forecast_time_utc"].max()).to_pydatetime(),
        scope=region,
        grain=DATA_GRAIN,
        source_table=TARGET_TABLE_FQN,
        row_count=row_count,
        entity_count=station_count,
        period_count=int(current_df["forecast_time_utc"].nunique()),
        completeness_status=completeness_status,
        run_id=None,
        payload=payload,
        database=database,
    )


if __name__ == "__main__":
    main()
