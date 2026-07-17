"""Orchestrate CAISO day-ahead LMPs."""
from __future__ import annotations

import logging
from pathlib import Path
from typing import Any
from uuid import uuid4

import pandas as pd
from dateutil.relativedelta import relativedelta

from backend import credentials
from backend.orchestration.power.caiso import _lmp_readiness
from backend.scrapes.power.caiso import _lmp
from backend.scrapes.power.caiso import da_lmps as scrape
from backend.utils import script_logging
from backend.utils.ops_logging import redact_secrets


API_SCRAPE_NAME = scrape.API_SCRAPE_NAME
TARGET_DATABASE: str | None = None
TARGET_SCHEMA = scrape.TARGET_SCHEMA
TARGET_TABLE = scrape.TARGET_TABLE
TARGET_TABLE_FQN = scrape.TARGET_TABLE_FQN
DATASET_NAME = "caiso_da_lmps"
DATA_SCOPE = "trading_hubs_np15_sp15"
DATA_GRAIN = "trading_date_hour_node"
INTERVAL_MINUTES = 60
DEFAULT_NODES = scrape.DEFAULT_NODES
DEFAULT_DELTA = relativedelta(days=1)
DEFAULT_LOOKAHEAD_DAYS = scrape.DEFAULT_LOOKAHEAD_DAYS
LOCAL_MARKET_TIMEZONE = scrape.LOCAL_MARKET_TIMEZONE

logger = logging.getLogger(__name__)


def main(
    start_date=None,
    end_date=None,
    delta: relativedelta = DEFAULT_DELTA,
    database: str | None = None,
    run_mode: str = "scheduled",
    metadata: dict[str, Any] | None = None,
    nodes: list[str] | tuple[str, ...] | None = None,
) -> pd.DataFrame | None:
    """Run the CAISO DA LMP workflow and emit readiness events."""
    start_date = _lmp.coerce_trading_date(start_date or scrape._resolve_default_start_date())
    end_date = _lmp.coerce_trading_date(end_date or scrape._resolve_default_end_date())
    selected_nodes = tuple(nodes or DEFAULT_NODES)
    database = database or credentials.AZURE_POSTGRESQL_DB_NAME
    run_logger = script_logging.init_logging(
        name=API_SCRAPE_NAME,
        log_dir=script_logging.get_log_dir(Path(__file__).parent / "logs"),
        log_to_file=True,
        delete_if_no_errors=True,
    )
    run_id = str(uuid4())
    rows_processed = 0
    frames: list[pd.DataFrame] = []
    combined_df = pd.DataFrame()

    try:
        run_logger.header(API_SCRAPE_NAME)
        run_logger.info(f"Run ID: {run_id}")
        run_logger.info(f"Run mode: {run_mode}")
        fetch_metadata = {"run_mode": run_mode, **(metadata or {})}

        current_date = start_date
        while current_date <= end_date:
            run_logger.section(f"Pulling data for {current_date:%Y-%m-%d}...")
            df = scrape._pull(
                trading_date=current_date,
                nodes=selected_nodes,
                run_id=run_id,
                database=database,
                metadata=fetch_metadata,
            )

            if df.empty:
                run_logger.section(f"No data returned for {current_date:%Y-%m-%d}.")
            else:
                run_logger.section(f"Upserting {len(df)} rows...")
                scrape._upsert(df=df, database=database)
                rows_processed += len(df)
                frames.append(df)
                run_logger.success(
                    f"Successfully pulled and upserted data for "
                    f"{current_date:%Y-%m-%d}."
                )

            current_date += delta

        run_logger.section("Emitting data availability event(s) ...")
        combined_df = pd.concat(frames, ignore_index=True) if frames else pd.DataFrame()
        events = _emit_data_availability_events(
            df=combined_df,
            run_id=run_id,
            database=database,
            expected_nodes=selected_nodes,
        )
        if events:
            for event in events:
                status = "created" if event.get("created") else "already existed"
                run_logger.info(f"Data availability event {event['event_key']} {status}.")
        else:
            run_logger.info(
                "No complete CAISO DA LMP trading date detected; "
                "no data availability event emitted."
            )

        run_logger.success(
            f"{API_SCRAPE_NAME} completed; {rows_processed} rows processed."
        )

    except Exception as exc:
        run_logger.exception(f"Pipeline failed: {redact_secrets(str(exc))}")
        raise
    finally:
        script_logging.close_logging()

    return combined_df if not combined_df.empty else None


def _emit_data_availability_events(
    *,
    df: pd.DataFrame,
    run_id: str | None,
    database: str | None = TARGET_DATABASE,
    expected_nodes: list[str] | tuple[str, ...] = DEFAULT_NODES,
) -> list[dict[str, Any]]:
    return _lmp_readiness.emit_lmp_data_availability_events(
        df=df,
        run_id=run_id,
        dataset_name=DATASET_NAME,
        source_table=TARGET_TABLE_FQN,
        scope=DATA_SCOPE,
        grain=DATA_GRAIN,
        interval_minutes=INTERVAL_MINUTES,
        expected_nodes=expected_nodes,
        database=database,
    )


def _data_availability_event_key(business_date) -> str:
    return _lmp_readiness.data_availability_event_key(
        dataset_name=DATASET_NAME,
        business_date=business_date,
        scope=DATA_SCOPE,
    )


def _expected_period_count_for_date(business_date) -> int:
    return _lmp_readiness.expected_period_count_for_date(
        business_date,
        interval_minutes=INTERVAL_MINUTES,
    )


if __name__ == "__main__":
    main()
