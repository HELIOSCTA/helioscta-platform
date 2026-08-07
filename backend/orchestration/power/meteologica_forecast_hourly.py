"""Shared orchestration helpers for Meteologica hourly forecast refreshes."""

from __future__ import annotations

import logging
from typing import Any, Callable

import pandas as pd

from backend.utils.data_availability import emit_data_availability_event

DATA_SOURCE_SYSTEM = "meteologica"
DATA_AVAILABILITY_TYPE = "freshness_forecast"
DATA_GRAIN = "content_update_forecast_hour"

logger = logging.getLogger(__name__)

EmitDataAvailabilityEvent = Callable[..., dict[str, Any]]


def run_forecast_refresh(
    *,
    scrape_module,
    dataset_name: str,
    target_table_fqn: str,
    scope: str,
    database: str | None = None,
    run_mode: str = "scheduled",
    retention_days: int,
    metadata: dict[str, Any] | None = None,
    include_content_ids: bool = True,
    emit_fn: EmitDataAvailabilityEvent = emit_data_availability_event,
) -> pd.DataFrame | None:
    """Run one forecast scrape module and emit a freshness event for returned rows."""
    df = scrape_module.main(
        database=database,
        run_mode=run_mode,
        retention_days=retention_days,
        metadata=metadata,
    )
    if df is None or df.empty:
        logger.info("No %s rows available for freshness emission.", dataset_name)
        return df

    event = emit_freshness_event(
        df=df,
        dataset_name=dataset_name,
        target_table_fqn=target_table_fqn,
        scope=scope,
        database=database,
        include_content_ids=include_content_ids,
        emit_fn=emit_fn,
    )
    status = "created" if event.get("created") else "already existed"
    logger.info("Data availability event %s %s.", event["event_key"], status)
    return df


def emit_freshness_event(
    *,
    df: pd.DataFrame,
    dataset_name: str,
    target_table_fqn: str,
    scope: str,
    database: str | None,
    include_content_ids: bool = True,
    emit_fn: EmitDataAvailabilityEvent = emit_data_availability_event,
) -> dict[str, Any]:
    current_df = df.copy()
    current_df["issue_date"] = pd.to_datetime(
        current_df["issue_date"],
        errors="coerce",
        utc=True,
    )
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
        "forecast_period_min": pd.Timestamp(
            current_df["forecast_period_start"].min()
        ).isoformat(),
        "forecast_period_max": pd.Timestamp(
            current_df["forecast_period_start"].max()
        ).isoformat(),
        "metrics": sorted(current_df["metric"].dropna().unique().tolist()),
        "forecast_areas": sorted(current_df["forecast_area"].dropna().unique().tolist()),
    }
    if include_content_ids:
        payload["content_ids"] = sorted(
            int(value) for value in current_df["content_id"].dropna().unique()
        )

    event_key = (
        f"{dataset_name}:{DATA_AVAILABILITY_TYPE}:"
        f"{pd.Timestamp(latest_issue).strftime('%Y%m%d%H%M')}"
    )
    return emit_fn(
        event_key=event_key,
        dataset=dataset_name,
        source_system=DATA_SOURCE_SYSTEM,
        availability_type=DATA_AVAILABILITY_TYPE,
        business_date=business_date,
        window_start=pd.Timestamp(
            current_df["forecast_period_start"].min()
        ).to_pydatetime(),
        window_end=pd.Timestamp(
            current_df["forecast_period_start"].max()
        ).to_pydatetime(),
        scope=scope,
        grain=DATA_GRAIN,
        source_table=target_table_fqn,
        row_count=row_count,
        entity_count=content_count,
        period_count=int(current_df["forecast_period_start"].nunique()),
        completeness_status="unknown",
        run_id=None,
        payload=payload,
        database=database,
    )
