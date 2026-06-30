"""Orchestrate PJM Meteologica hourly forecast refreshes."""

from __future__ import annotations

import logging
from typing import Any

import pandas as pd

from backend.orchestration.power.pjm import meteologica_da_price_forecast as da_price_forecast
from backend.scrapes.power.pjm import meteologica_forecast_hourly as scrape
from backend.utils.data_availability import emit_data_availability_event

API_SCRAPE_NAME = scrape.API_SCRAPE_NAME
TARGET_TABLE_FQN = scrape.TARGET_TABLE_FQN
DATASET_NAME = "pjm_meteologica_forecast_hourly"
DATA_SOURCE_SYSTEM = "meteologica"
DATA_AVAILABILITY_TYPE = "freshness_forecast"
DATA_GRAIN = "content_update_forecast_hour"

logger = logging.getLogger(__name__)


def main(
    *,
    database: str | None = None,
    run_mode: str = "scheduled",
    retention_days: int = scrape.DEFAULT_RETENTION_DAYS,
    metadata: dict[str, Any] | None = None,
    include_da_price: bool = True,
) -> pd.DataFrame | None:
    """Run PJM Meteologica forecast refreshes and emit freshness events."""
    df = scrape.main(
        database=database,
        run_mode=run_mode,
        retention_days=retention_days,
        metadata=metadata,
    )
    if df is None or df.empty:
        logger.info("No PJM Meteologica rows available for freshness emission.")
    else:
        event = _emit_freshness_event(df=df, database=database)
        status = "created" if event.get("created") else "already existed"
        logger.info("Data availability event %s %s.", event["event_key"], status)

    if include_da_price:
        da_price_forecast.main(
            database=database,
            run_mode=run_mode,
            retention_days=retention_days,
            metadata={**(metadata or {}), "triggered_by": API_SCRAPE_NAME},
        )
    return df


def _emit_freshness_event(
    *,
    df: pd.DataFrame,
    database: str | None,
) -> dict[str, Any]:
    current_df = df.copy()
    current_df["issue_date"] = pd.to_datetime(current_df["issue_date"], errors="coerce", utc=True)
    current_df["forecast_period_start"] = pd.to_datetime(
        current_df["forecast_period_start"],
        errors="coerce",
    )
    latest_issue = current_df["issue_date"].max()
    if pd.isna(latest_issue):
        raise ValueError("Cannot emit Meteologica freshness; issue_date is empty.")

    content_count = int(current_df["content_id"].nunique())
    area_count = int(current_df["forecast_area"].nunique())
    metric_count = int(current_df["metric"].nunique())
    row_count = int(len(current_df))
    business_date = pd.Timestamp(latest_issue).date()
    payload = {
        "latest_issue_date": pd.Timestamp(latest_issue).isoformat(),
        "content_count": content_count,
        "forecast_area_count": area_count,
        "metric_count": metric_count,
        "forecast_period_min": pd.Timestamp(current_df["forecast_period_start"].min()).isoformat(),
        "forecast_period_max": pd.Timestamp(current_df["forecast_period_start"].max()).isoformat(),
        "metrics": sorted(current_df["metric"].dropna().unique().tolist()),
        "forecast_areas": sorted(current_df["forecast_area"].dropna().unique().tolist()),
    }
    event_key = (
        f"{DATASET_NAME}:{DATA_AVAILABILITY_TYPE}:"
        f"{pd.Timestamp(latest_issue).strftime('%Y%m%d%H%M')}"
    )
    return emit_data_availability_event(
        event_key=event_key,
        dataset=DATASET_NAME,
        source_system=DATA_SOURCE_SYSTEM,
        availability_type=DATA_AVAILABILITY_TYPE,
        business_date=business_date,
        window_start=pd.Timestamp(current_df["forecast_period_start"].min()).to_pydatetime(),
        window_end=pd.Timestamp(current_df["forecast_period_start"].max()).to_pydatetime(),
        scope="PJM",
        grain=DATA_GRAIN,
        source_table=TARGET_TABLE_FQN,
        row_count=row_count,
        entity_count=content_count,
        period_count=int(current_df["forecast_period_start"].nunique()),
        completeness_status="unknown",
        run_id=None,
        payload=payload,
        database=database,
    )


if __name__ == "__main__":
    main()
