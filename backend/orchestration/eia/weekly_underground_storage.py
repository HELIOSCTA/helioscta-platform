"""Orchestrate EIA weekly underground storage refreshes."""

from __future__ import annotations

from collections.abc import Callable
from datetime import date, datetime, timedelta
from pathlib import Path
import time
from typing import Any
from uuid import uuid4
from zoneinfo import ZoneInfo

import pandas as pd

from backend import credentials
from backend.orchestration.eia import _polling
from backend.scrapes.eia import weekly_underground_storage as scrape
from backend.utils import script_logging
from backend.utils.ops_logging import redact_secrets


API_SCRAPE_NAME = scrape.API_SCRAPE_NAME
DEFAULT_RUN_MODE = "scheduled"
DEFAULT_METADATA = {
    "schedule_reason": "rolling_eia_weekly_underground_storage_refresh",
}
LOCAL_MARKET_TIMEZONE = "America/New_York"
EXPECTED_SERIES_COUNT = 8
POLL_CEILING_SECONDS = 90 * 60
POLL_WAIT_SECONDS = 2 * 60


def main(
    start_date: date | datetime | str | None = None,
    end_date: date | datetime | str | None = None,
    target_week_ending: date | datetime | str | None = None,
    database: str | None = None,
    run_mode: str = DEFAULT_RUN_MODE,
    metadata: dict[str, Any] | None = None,
    poll_until_available: bool | None = None,
    poll_ceiling_seconds: int = POLL_CEILING_SECONDS,
    poll_wait_seconds: int = POLL_WAIT_SECONDS,
    sleep_fn: Callable[[float], None] = time.sleep,
) -> pd.DataFrame | None:
    """Run the promoted EIA weekly underground storage workflow."""
    database = database or credentials.AZURE_POSTGRESQL_DB_NAME
    run_logger = script_logging.init_logging(
        name=API_SCRAPE_NAME,
        log_dir=script_logging.get_log_dir(Path(__file__).parent / "logs"),
        log_to_file=True,
        delete_if_no_errors=True,
    )
    run_id = str(uuid4())
    rows_processed = 0

    try:
        run_logger.header(API_SCRAPE_NAME)
        run_logger.info(f"Run ID: {run_id}")
        run_logger.info(f"Run mode: {run_mode}")
        fetch_metadata = {
            "run_mode": run_mode,
            **DEFAULT_METADATA,
            **(metadata or {}),
        }
        should_poll = (
            run_mode == DEFAULT_RUN_MODE
            if poll_until_available is None
            else poll_until_available
        )

        if should_poll:
            resolved_target_week_ending = _resolve_target_week_ending(
                target_week_ending=target_week_ending,
                end_date=end_date,
            )
            run_logger.info(
                "Target EIA weekly storage week ending: "
                f"{resolved_target_week_ending.isoformat()}"
            )
            run_logger.info(
                "Polling window: "
                f"{poll_ceiling_seconds // 60}m ceiling, "
                f"{poll_wait_seconds}s interval"
            )
            run_logger.section(
                "Waiting for weekly underground storage rows for "
                f"{resolved_target_week_ending}..."
            )
            df = _poll_for_target_week_ending(
                target_week_ending=resolved_target_week_ending,
                start_date=start_date,
                end_date=end_date,
                run_id=run_id,
                database=database,
                metadata=fetch_metadata,
                poll_ceiling_seconds=poll_ceiling_seconds,
                poll_wait_seconds=poll_wait_seconds,
                sleep_fn=sleep_fn,
            )
        else:
            df = scrape._pull(
                start_date=start_date,
                end_date=end_date,
                run_id=run_id,
                database=database,
                metadata=fetch_metadata,
            )

        if df.empty:
            run_logger.section("No data returned.")
        else:
            run_logger.section(f"Upserting {len(df)} rows...")
            scrape._upsert(df=df, database=database)
            rows_processed = len(df)

        run_logger.success(
            f"{API_SCRAPE_NAME} completed; {rows_processed} rows processed."
        )
        return df if not df.empty else None
    except Exception as exc:
        run_logger.exception(f"Pipeline failed: {redact_secrets(str(exc))}")
        raise
    finally:
        script_logging.close_logging()


def _poll_for_target_week_ending(
    *,
    target_week_ending: date,
    start_date: date | datetime | str | None,
    end_date: date | datetime | str | None,
    run_id: str | None,
    database: str | None,
    metadata: dict[str, Any],
    poll_ceiling_seconds: int,
    poll_wait_seconds: int,
    sleep_fn: Callable[[float], None],
) -> pd.DataFrame:
    return _polling.poll_until_available(
        pipeline_name=API_SCRAPE_NAME,
        route=scrape.ROUTE,
        target_table=scrape.TARGET_TABLE_FQN,
        run_id=run_id,
        database=database,
        metadata={
            **metadata,
            "target_week_ending": target_week_ending.isoformat(),
            "expected_series_count": EXPECTED_SERIES_COUNT,
            "poll_ceiling_seconds": poll_ceiling_seconds,
            "poll_wait_seconds": poll_wait_seconds,
        },
        fetch_once=lambda poll_count: scrape._pull(
            start_date=start_date,
            end_date=end_date,
            run_id=run_id,
            database=database,
            metadata={
                **metadata,
                "target_week_ending": target_week_ending.isoformat(),
                "poll_count": poll_count,
            },
        ),
        check_available=lambda df: _weekly_storage_availability(
            df,
            target_week_ending,
        ),
        poll_ceiling_seconds=poll_ceiling_seconds,
        poll_wait_seconds=poll_wait_seconds,
        sleep_fn=sleep_fn,
    )


def _weekly_storage_availability(
    df: pd.DataFrame,
    target_week_ending: date,
) -> _polling.AvailabilityResult:
    if df.empty:
        return _polling.AvailabilityResult(
            is_available=False,
            message=(
                "EIA weekly underground storage data is not available for "
                f"{target_week_ending}."
            ),
            metadata={
                "target_week_ending": target_week_ending.isoformat(),
                "target_row_count": 0,
                "target_series_count": 0,
            },
        )

    current_df = df.copy()
    current_df["eia_week_ending"] = pd.to_datetime(
        current_df["eia_week_ending"],
        errors="coerce",
    ).dt.date
    target_df = current_df.loc[current_df["eia_week_ending"] == target_week_ending]
    target_row_count = int(len(target_df))
    target_series_count = int(target_df["series"].nunique())
    metadata = {
        "target_week_ending": target_week_ending.isoformat(),
        "target_row_count": target_row_count,
        "target_series_count": target_series_count,
        "expected_series_count": EXPECTED_SERIES_COUNT,
        "target_region_count": int(target_df["region"].nunique()),
    }
    if target_row_count > 0 and target_series_count >= EXPECTED_SERIES_COUNT:
        return _polling.AvailabilityResult(
            is_available=True,
            message="target EIA weekly underground storage data is available",
            metadata=metadata,
        )
    if target_row_count > 0:
        message = (
            "EIA weekly underground storage data is partially available for "
            f"{target_week_ending}: {target_series_count} of "
            f"{EXPECTED_SERIES_COUNT} expected series."
        )
    else:
        message = (
            "EIA weekly underground storage data is not available for "
            f"{target_week_ending}."
        )
    return _polling.AvailabilityResult(
        is_available=False,
        message=message,
        metadata=metadata,
    )


def _resolve_target_week_ending(
    *,
    target_week_ending: date | datetime | str | None,
    end_date: date | datetime | str | None,
    now: datetime | None = None,
) -> date:
    if target_week_ending is not None:
        return _normalize_date(target_week_ending)
    if end_date is not None:
        return _normalize_date(end_date)
    now = now or datetime.now(ZoneInfo(LOCAL_MARKET_TIMEZONE))
    current_day = now.date()
    days_since_thursday = (current_day.weekday() - 3) % 7
    latest_release_thursday = current_day - timedelta(days=days_since_thursday)
    return latest_release_thursday - timedelta(days=6)


def _normalize_date(value: date | datetime | str) -> date:
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    return pd.to_datetime(value).date()


if __name__ == "__main__":
    main()
