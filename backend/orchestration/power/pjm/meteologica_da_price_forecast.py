"""Orchestrate PJM Meteologica DA price forecast refreshes."""

from __future__ import annotations

import logging
from typing import Any

import pandas as pd

from backend.scrapes.power.pjm import meteologica_da_price_forecast as scrape
from backend.utils.data_availability import emit_data_availability_event

API_SCRAPE_NAME = scrape.API_SCRAPE_NAME
DATASET_NAME = "pjm_meteologica_da_price_forecast"
DATA_SOURCE_SYSTEM = "meteologica"
DATA_AVAILABILITY_TYPE = "freshness_forecast"
DATA_GRAIN = "content_update_forecast_hour"
TARGET_TABLES = f"{scrape.DET_TABLE_FQN} + {scrape.ENS_TABLE_FQN}"

logger = logging.getLogger(__name__)


def main(
    *,
    database: str | None = None,
    run_mode: str = "scheduled",
    retention_days: int = scrape.DEFAULT_RETENTION_DAYS,
    forecast_horizon_days: int = scrape.DEFAULT_FORECAST_HORIZON_DAYS,
    metadata: dict[str, Any] | None = None,
) -> dict[str, pd.DataFrame] | None:
    """Run the PJM Meteologica DA price refresh and emit a freshness event."""
    frames_by_table = scrape.main(
        database=database,
        run_mode=run_mode,
        retention_days=retention_days,
        forecast_horizon_days=forecast_horizon_days,
        metadata=metadata,
    )
    if not frames_by_table:
        logger.info("No PJM Meteologica DA price rows available for freshness emission.")
        return frames_by_table

    event = _emit_freshness_event(frames_by_table=frames_by_table, database=database)
    status = "created" if event.get("created") else "already existed"
    logger.info("Data availability event %s %s.", event["event_key"], status)
    return frames_by_table


def _emit_freshness_event(
    *,
    frames_by_table: dict[str, pd.DataFrame],
    database: str | None,
) -> dict[str, Any]:
    table_frames: list[pd.DataFrame] = []
    table_payloads: dict[str, dict[str, Any]] = {}
    for table_name, frame in frames_by_table.items():
        current = frame.copy()
        current["issue_date"] = pd.to_datetime(current["issue_date"], errors="coerce", utc=True)
        current["forecast_period_start"] = pd.to_datetime(
            current["forecast_period_start"],
            errors="coerce",
        )
        current["target_table"] = f"{scrape.TARGET_SCHEMA}.{table_name}"
        table_frames.append(current)
        table_payloads[table_name] = {
            "row_count": int(len(current)),
            "latest_issue_date": _timestamp_iso(current["issue_date"].max()),
            "forecast_period_min": _timestamp_iso(current["forecast_period_start"].min()),
            "forecast_period_max": _timestamp_iso(current["forecast_period_start"].max()),
            "update_count": int(current["update_id"].nunique()),
        }

    combined = pd.concat(table_frames, ignore_index=True)
    latest_issue = combined["issue_date"].max()
    if pd.isna(latest_issue):
        raise ValueError("Cannot emit Meteologica DA price freshness; issue_date is empty.")

    row_count = int(len(combined))
    content_count = int(combined["content_id"].nunique())
    period_count = int(combined["forecast_period_start"].nunique())
    business_date = pd.Timestamp(latest_issue).date()
    payload = {
        "latest_issue_date": _timestamp_iso(latest_issue),
        "content_count": content_count,
        "forecast_period_min": _timestamp_iso(combined["forecast_period_start"].min()),
        "forecast_period_max": _timestamp_iso(combined["forecast_period_start"].max()),
        "tables": table_payloads,
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
        window_start=pd.Timestamp(combined["forecast_period_start"].min()).to_pydatetime(),
        window_end=pd.Timestamp(combined["forecast_period_start"].max()).to_pydatetime(),
        scope="PJM WESTERN HUB",
        grain=DATA_GRAIN,
        source_table=TARGET_TABLES,
        row_count=row_count,
        entity_count=content_count,
        period_count=period_count,
        completeness_status="unknown",
        run_id=None,
        payload=payload,
        database=database,
    )


def _timestamp_iso(value: object) -> str | None:
    if pd.isna(value):
        return None
    return pd.Timestamp(value).isoformat()


if __name__ == "__main__":
    main()
