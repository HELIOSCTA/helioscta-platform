"""Orchestrate ERCOT Meteologica hourly forecast refreshes."""

from __future__ import annotations

import logging
from typing import Any

import pandas as pd

from backend.orchestration.power import meteologica_forecast_hourly as common
from backend.scrapes.power.ercot import meteologica_forecast_hourly as scrape
from backend.utils.data_availability import emit_data_availability_event

API_SCRAPE_NAME = scrape.API_SCRAPE_NAME
TARGET_TABLE_FQN = scrape.TARGET_TABLE_FQN
DATASET_NAME = "ercot_meteologica_forecast_hourly"
DATA_SOURCE_SYSTEM = common.DATA_SOURCE_SYSTEM
DATA_AVAILABILITY_TYPE = common.DATA_AVAILABILITY_TYPE
DATA_GRAIN = common.DATA_GRAIN

logger = logging.getLogger(__name__)


def main(
    *,
    database: str | None = None,
    run_mode: str = "scheduled",
    retention_days: int = scrape.DEFAULT_RETENTION_DAYS,
    metadata: dict[str, Any] | None = None,
) -> pd.DataFrame | None:
    """Run ERCOT Meteologica forecast refreshes and emit freshness events."""
    df = scrape.main(
        database=database,
        run_mode=run_mode,
        retention_days=retention_days,
        metadata=metadata,
    )
    if df is None or df.empty:
        logger.info("No ERCOT Meteologica rows available for freshness emission.")
    else:
        event = _emit_freshness_event(df=df, database=database)
        status = "created" if event.get("created") else "already existed"
        logger.info("Data availability event %s %s.", event["event_key"], status)
    return df


def _emit_freshness_event(
    *,
    df: pd.DataFrame,
    database: str | None,
) -> dict[str, Any]:
    return common.emit_freshness_event(
        df=df,
        dataset_name=DATASET_NAME,
        target_table_fqn=TARGET_TABLE_FQN,
        scope="ERCOT",
        database=database,
        emit_fn=emit_data_availability_event,
    )


if __name__ == "__main__":
    main()
