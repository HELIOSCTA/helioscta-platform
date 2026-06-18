"""Orchestrate NOAA AviationWeather METAR observation refreshes."""

from __future__ import annotations

import logging
from datetime import datetime
from typing import Any

import pandas as pd

from backend.scrapes.weather.noaa import metar_observations as scrape
from backend.utils.data_availability import emit_data_availability_event

API_SCRAPE_NAME = scrape.API_SCRAPE_NAME
TARGET_TABLE_FQN = scrape.TARGET_TABLE_FQN
DATASET_NAME = "weather_noaa_metar_observations"
DATA_SOURCE_SYSTEM = "noaa_aviationweather"
DATA_AVAILABILITY_TYPE = "freshness_observed"
DATA_GRAIN = "station_observation_utc"
DEFAULT_REGION = scrape.DEFAULT_REGION

logger = logging.getLogger(__name__)


def main(
    *,
    region: str = DEFAULT_REGION,
    hours: int = scrape.DEFAULT_HOURS,
    database: str | None = None,
    run_mode: str = "scheduled",
    metadata: dict[str, Any] | None = None,
) -> pd.DataFrame | None:
    """Run the NOAA METAR refresh and emit a freshness event."""
    df = scrape.main(
        region=region,
        hours=hours,
        database=database,
        run_mode=run_mode,
        metadata=metadata,
    )
    if df is None or df.empty:
        logger.info("No NOAA METAR rows available for freshness emission")
        return df

    event = _emit_freshness_event(df=df, region=region, database=database)
    status = "created" if event.get("created") else "already existed"
    logger.info("Data availability event %s %s.", event["event_key"], status)
    return df


def _emit_freshness_event(
    *,
    df: pd.DataFrame,
    region: str,
    database: str | None,
) -> dict[str, Any]:
    current_df = df.copy()
    current_df["observation_time_utc"] = pd.to_datetime(
        current_df["observation_time_utc"],
        errors="coerce",
        utc=True,
    )
    latest = current_df["observation_time_utc"].max()
    if pd.isna(latest):
        raise ValueError("Cannot emit NOAA METAR freshness; observation_time_utc is empty")

    station_count = int(current_df["station_id"].nunique())
    row_count = int(len(current_df))
    business_date = pd.Timestamp(latest).date()
    window_start = pd.Timestamp(current_df["observation_time_utc"].min()).to_pydatetime()
    window_end = pd.Timestamp(latest).to_pydatetime()
    payload = {
        "region": region,
        "latest_observation_time_utc": pd.Timestamp(latest).isoformat(),
        "station_count": station_count,
        "window_min": pd.Timestamp(window_start).isoformat(),
        "window_max": pd.Timestamp(window_end).isoformat(),
    }
    event_key = (
        f"{DATASET_NAME}:{DATA_AVAILABILITY_TYPE}:"
        f"{region}:{pd.Timestamp(latest).strftime('%Y%m%d%H%M')}"
    )
    return emit_data_availability_event(
        event_key=event_key,
        dataset=DATASET_NAME,
        source_system=DATA_SOURCE_SYSTEM,
        availability_type=DATA_AVAILABILITY_TYPE,
        business_date=business_date,
        window_start=window_start,
        window_end=window_end,
        scope=region,
        grain=DATA_GRAIN,
        source_table=TARGET_TABLE_FQN,
        row_count=row_count,
        entity_count=station_count,
        period_count=int(current_df["observation_time_utc"].nunique()),
        completeness_status="unknown",
        run_id=None,
        payload=payload,
        database=database,
    )


if __name__ == "__main__":
    main()
