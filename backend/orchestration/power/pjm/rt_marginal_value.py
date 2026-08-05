"""Orchestrate PJM real-time marginal value release polling."""

from __future__ import annotations

import logging
import time
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Any
from urllib.parse import urlsplit
from uuid import uuid4
from zoneinfo import ZoneInfo

import pandas as pd

from backend import credentials
from backend.orchestration.power.pjm import marginal_value
from backend.orchestration.power.pjm._policies import (
    DataNotYetAvailable,
    api_poll_policy,
)
from backend.scrapes.power.pjm import client
from backend.scrapes.power.pjm import rt_marginal_value as scrape
from backend.scrapes.power.pjm.data_miner_feed import upsert_feed_frame
from backend.utils import script_logging
from backend.utils.ops_logging import log_api_fetch, redact_secrets


logger = logging.getLogger(__name__)

CONFIG = scrape.CONFIG
API_SCRAPE_NAME = scrape.API_SCRAPE_NAME
TARGET_TABLE = scrape.TARGET_TABLE
TARGET_TABLE_FQN = scrape.TARGET_TABLE_FQN
DATASET_NAME = "pjm_rt_marginal_value"
LOCAL_MARKET_TIMEZONE = "America/New_York"
EXPECTED_INTERVAL_MINUTES = 5
DEFAULT_TARGET_LAG_DAYS = 2
DEFAULT_LOOKBACK_DAYS = 5
POLL_CEILING_SECONDS = 3 * 60 * 60
POLL_WAIT_SECONDS = 15 * 60


def _target_market_date(value: date | datetime | str | None = None) -> date:
    if value is None:
        current_eastern_date = datetime.now(ZoneInfo(LOCAL_MARKET_TIMEZONE)).date()
        return current_eastern_date - timedelta(days=DEFAULT_TARGET_LAG_DAYS)
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    return date.fromisoformat(value)


def _market_dates(end_date: date, lookback_days: int) -> list[date]:
    window_days = max(1, int(lookback_days))
    start_date = end_date - timedelta(days=window_days - 1)
    return [start_date + timedelta(days=offset) for offset in range(window_days)]


def _fetch_market_day(target_date: date) -> pd.DataFrame:
    return marginal_value.fetch_market_day(target_date, CONFIG)


@api_poll_policy(max_seconds=POLL_CEILING_SECONDS, wait_seconds=POLL_WAIT_SECONDS)
def _wait_for_target_window(
    *,
    target_date: date,
    lookback_days: int,
) -> dict[date, pd.DataFrame]:
    frames_by_date = {
        market_date: _fetch_market_day(market_date)
        for market_date in _market_dates(target_date, lookback_days)
    }
    target_frame = frames_by_date.get(target_date, pd.DataFrame())
    shape = _market_day_shape(target_frame, target_date)
    if not shape["is_complete"]:
        raise DataNotYetAvailable(
            "PJM rt_marginal_value is not available for "
            f"{target_date.isoformat()} "
            f"(rows={shape['row_count']}, periods={shape['period_count']}, "
            f"duplicate_keys={shape['duplicate_key_count']})"
        )
    return frames_by_date


def _wait_for_target_window_logged(
    *,
    target_date: date,
    lookback_days: int,
    run_id: str | None,
    database: str | None,
    metadata: dict[str, Any] | None = None,
) -> dict[date, pd.DataFrame]:
    parsed_url = urlsplit(f"{client.BASE_URL}{CONFIG.feed_name}")
    started = time.perf_counter()
    window_dates = _market_dates(target_date, lookback_days)

    try:
        frames_by_date = _wait_for_target_window(
            target_date=target_date,
            lookback_days=lookback_days,
        )
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
                "window_start_market_date": window_dates[0].isoformat(),
                "window_end_market_date": window_dates[-1].isoformat(),
                "lookback_days": lookback_days,
                "poll_count": _poll_count(),
                "poll_seconds": round(elapsed_ms / 1000, 1),
            },
            database=database,
        )
        raise

    elapsed_ms = round((time.perf_counter() - started) * 1000)
    shapes_by_date = {
        market_date.isoformat(): _market_day_shape(df, market_date)
        for market_date, df in frames_by_date.items()
    }
    rows_returned = int(sum(len(df) for df in frames_by_date.values()))
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
        rows_returned=rows_returned,
        metadata={
            **(metadata or {}),
            "target_market_date": target_date.isoformat(),
            "window_start_market_date": window_dates[0].isoformat(),
            "window_end_market_date": window_dates[-1].isoformat(),
            "lookback_days": lookback_days,
            "poll_count": _poll_count(),
            "poll_seconds": round(elapsed_ms / 1000, 1),
            "market_date_shapes": shapes_by_date,
        },
        database=database,
    )
    return frames_by_date


def _poll_count() -> int:
    stats = getattr(_wait_for_target_window, "statistics", {}) or {}
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
    frames_by_date: dict[date, pd.DataFrame],
    run_id: str | None,
    database: str | None,
) -> list[dict[str, Any]]:
    events: list[dict[str, Any]] = []
    for market_date, df in frames_by_date.items():
        event = marginal_value.emit_marginal_value_availability_event(
            dataset_name=DATASET_NAME,
            source_table=TARGET_TABLE_FQN,
            df=df,
            target_date=market_date,
            run_id=run_id,
            database=database,
            config=CONFIG,
            expected_interval_minutes=EXPECTED_INTERVAL_MINUTES,
        )
        if event:
            events.append(event)
    return events


def _data_availability_event_key(business_date: date) -> str:
    return marginal_value.data_availability_event_key(DATASET_NAME, business_date)


def _combine_nonempty_frames(frames_by_date: dict[date, pd.DataFrame]) -> pd.DataFrame:
    frames = [df for df in frames_by_date.values() if not df.empty]
    if not frames:
        return pd.DataFrame(columns=list(CONFIG.columns))
    return pd.concat(frames, ignore_index=True).drop_duplicates(
        subset=list(CONFIG.primary_key),
        keep="last",
    )


def main(
    *,
    target_date: date | datetime | str | None = None,
    lookback_days: int = DEFAULT_LOOKBACK_DAYS,
    database: str | None = None,
    run_mode: str = "scheduled",
    metadata: dict[str, Any] | None = None,
) -> pd.DataFrame:
    """Poll and upsert a rolling PJM RT marginal value release window."""
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
        run_logger.info(f"Lookback days: {lookback_days}")
        run_logger.info(
            "Polling window: "
            f"{POLL_CEILING_SECONDS // 3600}h ceiling, "
            f"{POLL_WAIT_SECONDS}s interval"
        )

        run_logger.section("Waiting for RT marginal value release window ...")
        frames_by_date = _wait_for_target_window_logged(
            target_date=market_date,
            lookback_days=lookback_days,
            run_id=run_id,
            database=database,
            metadata=fetch_metadata,
        )
        df = _combine_nonempty_frames(frames_by_date)

        run_logger.section(f"Upserting {len(df)} rows ...")
        if not df.empty:
            upsert_feed_frame(df, CONFIG, database=database)
        else:
            run_logger.info("No nonempty RT marginal value frames to upsert.")

        run_logger.section("Emitting data availability event(s) ...")
        events = _emit_data_availability_events(
            frames_by_date=frames_by_date,
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
