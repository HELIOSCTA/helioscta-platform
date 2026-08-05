"""Orchestrate PJM day-ahead marginal value publication polling."""

from __future__ import annotations

import logging
import time
from datetime import date, datetime
from pathlib import Path
from typing import Any
from urllib.parse import urlsplit
from uuid import uuid4
from zoneinfo import ZoneInfo

import pandas as pd
from dateutil.relativedelta import relativedelta

from backend import credentials
from backend.orchestration.power.pjm import marginal_value
from backend.orchestration.power.pjm._policies import (
    DataNotYetAvailable,
    api_poll_policy,
)
from backend.scrapes.power.pjm import client
from backend.scrapes.power.pjm import da_marginal_value as scrape
from backend.scrapes.power.pjm.data_miner_feed import upsert_feed_frame
from backend.utils import script_logging
from backend.utils.ops_logging import log_api_fetch, redact_secrets


logger = logging.getLogger(__name__)

CONFIG = scrape.CONFIG
API_SCRAPE_NAME = scrape.API_SCRAPE_NAME
TARGET_TABLE = scrape.TARGET_TABLE
TARGET_TABLE_FQN = scrape.TARGET_TABLE_FQN
DATASET_NAME = "pjm_da_marginal_value"
LOCAL_MARKET_TIMEZONE = "America/New_York"
EXPECTED_INTERVAL_MINUTES = 60
POLL_CEILING_SECONDS = 4 * 60 * 60
POLL_WAIT_SECONDS = 2 * 60


def _target_market_date(value: date | datetime | str | None = None) -> date:
    if value is None:
        return (
            datetime.now(ZoneInfo(LOCAL_MARKET_TIMEZONE)) + relativedelta(days=1)
        ).date()
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    return date.fromisoformat(value)


def _fetch_market_day(target_date: date) -> pd.DataFrame:
    return marginal_value.fetch_market_day(target_date, CONFIG)


@api_poll_policy(max_seconds=POLL_CEILING_SECONDS, wait_seconds=POLL_WAIT_SECONDS)
def _wait_for_available_data(target_date: date) -> pd.DataFrame:
    df = _fetch_market_day(target_date)
    shape = _market_day_shape(df, target_date)
    if not shape["is_complete"]:
        raise DataNotYetAvailable(
            "PJM da_marginal_value is not available for "
            f"{target_date.isoformat()} "
            f"(rows={shape['row_count']}, periods={shape['period_count']}, "
            f"duplicate_keys={shape['duplicate_key_count']})"
        )
    return df


def _wait_for_available_data_logged(
    *,
    target_date: date,
    run_id: str | None,
    database: str | None,
    metadata: dict[str, Any] | None = None,
) -> pd.DataFrame:
    parsed_url = urlsplit(f"{client.BASE_URL}{CONFIG.feed_name}")
    started = time.perf_counter()

    try:
        df = _wait_for_available_data(target_date)
    except Exception as exc:
        elapsed_ms = round((time.perf_counter() - started) * 1000)
        log_api_fetch(
            actor_type="scrape",
            provider="pjm",
            pipeline_name=API_SCRAPE_NAME,
            run_id=run_id,
            operation_name=f"{API_SCRAPE_NAME}_poll",
            target_table=TARGET_TABLE_FQN,
            method="GET",
            target_host=parsed_url.netloc,
            target_path=parsed_url.path,
            status="failure",
            elapsed_ms=elapsed_ms,
            attempt=_poll_count(),
            error_type=type(exc).__name__,
            error_message=redact_secrets(str(exc)),
            metadata={
                **(metadata or {}),
                "target_market_date": target_date.isoformat(),
                "poll_count": _poll_count(),
                "poll_seconds": round(elapsed_ms / 1000, 1),
            },
            database=database,
        )
        raise

    elapsed_ms = round((time.perf_counter() - started) * 1000)
    shape = _market_day_shape(df, target_date)
    log_api_fetch(
        actor_type="scrape",
        provider="pjm",
        pipeline_name=API_SCRAPE_NAME,
        run_id=run_id,
        operation_name=f"{API_SCRAPE_NAME}_poll",
        target_table=TARGET_TABLE_FQN,
        method="GET",
        target_host=parsed_url.netloc,
        target_path=parsed_url.path,
        status="success",
        http_status=200,
        elapsed_ms=elapsed_ms,
        attempt=_poll_count(),
        rows_returned=int(len(df)),
        metadata={
            **(metadata or {}),
            "target_market_date": target_date.isoformat(),
            "poll_count": _poll_count(),
            "poll_seconds": round(elapsed_ms / 1000, 1),
            "expected_period_count": shape["expected_period_count"],
            "period_count": shape["period_count"],
            "constraint_count": shape["constraint_count"],
        },
        database=database,
    )
    return df


def _poll_count() -> int:
    stats = getattr(_wait_for_available_data, "statistics", {}) or {}
    return int(stats.get("attempt_number", 1))


def _market_day_shape(df: pd.DataFrame, target_date: date) -> dict[str, Any]:
    return marginal_value.market_day_shape(
        df,
        target_date,
        CONFIG,
        expected_interval_minutes=EXPECTED_INTERVAL_MINUTES,
    )


def _emit_data_availability_events(
    *,
    df: pd.DataFrame,
    target_date: date,
    run_id: str | None,
    database: str | None,
) -> list[dict[str, Any]]:
    event = marginal_value.emit_marginal_value_availability_event(
        dataset_name=DATASET_NAME,
        source_table=TARGET_TABLE_FQN,
        df=df,
        target_date=target_date,
        run_id=run_id,
        database=database,
        config=CONFIG,
        expected_interval_minutes=EXPECTED_INTERVAL_MINUTES,
    )
    return [event] if event else []


def _data_availability_event_key(business_date: date) -> str:
    return marginal_value.data_availability_event_key(DATASET_NAME, business_date)


def main(
    *,
    target_date: date | datetime | str | None = None,
    database: str | None = None,
    run_mode: str = "scheduled",
    metadata: dict[str, Any] | None = None,
) -> pd.DataFrame:
    """Poll and upsert the current PJM DA marginal value publication."""
    market_date = _target_market_date(target_date)
    database = database or credentials.AZURE_POSTGRESQL_DB_NAME
    run_logger = script_logging.init_logging(
        name=API_SCRAPE_NAME,
        log_dir=script_logging.get_log_dir(Path(__file__).parent / "logs"),
        log_to_file=True,
        delete_if_no_errors=True,
    )
    run_id = str(uuid4())
    fetch_metadata = {"run_mode": run_mode, **(metadata or {})}

    try:
        run_logger.header(API_SCRAPE_NAME)
        run_logger.info(f"Run ID: {run_id}")
        run_logger.info(f"Run mode: {run_mode}")
        run_logger.info(f"Target market date: {market_date.isoformat()}")
        run_logger.info(
            "Polling window: "
            f"{POLL_CEILING_SECONDS // 3600}h ceiling, "
            f"{POLL_WAIT_SECONDS}s interval"
        )

        run_logger.section("Waiting for DA marginal value data ...")
        df = _wait_for_available_data_logged(
            target_date=market_date,
            run_id=run_id,
            database=database,
            metadata=fetch_metadata,
        )

        run_logger.section(f"Upserting {len(df)} rows ...")
        upsert_feed_frame(df, CONFIG, database=database)

        run_logger.section("Emitting data availability event(s) ...")
        events = _emit_data_availability_events(
            df=df,
            target_date=market_date,
            run_id=run_id,
            database=database,
        )
        for event in events:
            status = "created" if event.get("created") else "updated"
            run_logger.info(f"Data availability event {event['event_key']} {status}.")

        run_logger.success(f"{API_SCRAPE_NAME} completed; {len(df)} rows processed.")
        return df

    except Exception as exc:
        run_logger.exception(f"Pipeline failed: {redact_secrets(str(exc))}")
        raise

    finally:
        script_logging.close_logging()


if __name__ == "__main__":
    main()
