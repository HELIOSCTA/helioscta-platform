"""Orchestrate EIA monthly natural gas consumption refreshes."""

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
from backend.scrapes.eia import nat_gas_consumption_end_use_monthly as scrape
from backend.utils import script_logging
from backend.utils.ops_logging import redact_secrets


API_SCRAPE_NAME = scrape.API_SCRAPE_NAME
DEFAULT_RUN_MODE = "scheduled"
DEFAULT_METADATA = {
    "schedule_reason": "rolling_eia_nat_gas_consumption_end_use_monthly_refresh",
}
LOCAL_MARKET_TIMEZONE = "America/New_York"
POLL_CEILING_SECONDS = 6 * 60 * 60
POLL_WAIT_SECONDS = 30 * 60


def main(
    start_month: date | datetime | str | None = None,
    end_month: date | datetime | str | None = None,
    target_month: date | datetime | str | None = None,
    database: str | None = None,
    run_mode: str = DEFAULT_RUN_MODE,
    metadata: dict[str, Any] | None = None,
    poll_until_available: bool | None = None,
    poll_ceiling_seconds: int = POLL_CEILING_SECONDS,
    poll_wait_seconds: int = POLL_WAIT_SECONDS,
    sleep_fn: Callable[[float], None] = time.sleep,
    run_only_on_likely_release_day: bool = False,
    now: datetime | None = None,
) -> pd.DataFrame | None:
    """Run the promoted monthly natural gas consumption workflow."""
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
            resolved_now = now or datetime.now(ZoneInfo(LOCAL_MARKET_TIMEZONE))
            if run_only_on_likely_release_day and not _is_likely_release_day(
                resolved_now.date()
            ):
                run_logger.section(
                    "Skipping monthly natural gas consumption poll outside "
                    "the likely last-business-day release window."
                )
                run_logger.success(f"{API_SCRAPE_NAME} skipped; 0 rows processed.")
                return None

            resolved_target_month = _resolve_target_month(
                target_month=target_month,
                end_month=end_month,
                now=resolved_now,
            )
            run_logger.info(
                "Target EIA monthly natural gas report month: "
                f"{resolved_target_month.isoformat()}"
            )
            run_logger.info(
                "Polling window: "
                f"{poll_ceiling_seconds // 60}m ceiling, "
                f"{poll_wait_seconds}s interval"
            )
            run_logger.section(
                "Waiting for monthly natural gas consumption rows for "
                f"{resolved_target_month:%Y-%m}..."
            )
            df = _poll_for_target_month(
                target_month=resolved_target_month,
                start_month=start_month,
                end_month=end_month,
                run_id=run_id,
                database=database,
                metadata=fetch_metadata,
                poll_ceiling_seconds=poll_ceiling_seconds,
                poll_wait_seconds=poll_wait_seconds,
                sleep_fn=sleep_fn,
            )
        else:
            df = scrape._pull(
                start_month=start_month,
                end_month=end_month,
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


def _poll_for_target_month(
    *,
    target_month: date,
    start_month: date | datetime | str | None,
    end_month: date | datetime | str | None,
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
            "target_month": target_month.isoformat(),
            "poll_ceiling_seconds": poll_ceiling_seconds,
            "poll_wait_seconds": poll_wait_seconds,
        },
        fetch_once=lambda poll_count: scrape._pull(
            start_month=start_month,
            end_month=end_month,
            run_id=run_id,
            database=database,
            metadata={
                **metadata,
                "target_month": target_month.isoformat(),
                "poll_count": poll_count,
            },
        ),
        check_available=lambda df: _monthly_consumption_availability(
            df,
            target_month,
        ),
        poll_ceiling_seconds=poll_ceiling_seconds,
        poll_wait_seconds=poll_wait_seconds,
        sleep_fn=sleep_fn,
    )


def _monthly_consumption_availability(
    df: pd.DataFrame,
    target_month: date,
) -> _polling.AvailabilityResult:
    if df.empty:
        return _polling.AvailabilityResult(
            is_available=False,
            message=(
                "EIA monthly natural gas consumption data is not available for "
                f"{target_month:%Y-%m}."
            ),
            metadata={
                "target_month": target_month.isoformat(),
                "target_row_count": 0,
                "target_series_count": 0,
            },
        )

    current_df = df.copy()
    current_df["report_month"] = (
        pd.to_datetime(current_df["report_month"], errors="coerce")
        .dt.to_period("M")
        .dt.to_timestamp()
        .dt.date
    )
    target_df = current_df.loc[current_df["report_month"] == target_month]
    target_row_count = int(len(target_df))
    metadata = {
        "target_month": target_month.isoformat(),
        "target_row_count": target_row_count,
        "target_series_count": int(target_df["series"].nunique()),
        "target_process_count": int(target_df["process"].nunique()),
        "target_area_count": int(target_df["duoarea"].nunique()),
    }
    if target_row_count > 0:
        return _polling.AvailabilityResult(
            is_available=True,
            message="target EIA monthly natural gas consumption data is available",
            metadata=metadata,
        )
    return _polling.AvailabilityResult(
        is_available=False,
        message=(
            "EIA monthly natural gas consumption data is not available for "
            f"{target_month:%Y-%m}."
        ),
        metadata=metadata,
    )


def _resolve_target_month(
    *,
    target_month: date | datetime | str | None,
    end_month: date | datetime | str | None,
    now: datetime | None = None,
) -> date:
    if target_month is not None:
        return _normalize_month(target_month)
    if end_month is not None:
        return _normalize_month(end_month)
    now = now or datetime.now(ZoneInfo(LOCAL_MARKET_TIMEZONE))
    return scrape._add_months(
        now.date().replace(day=1),
        -scrape.DEFAULT_REPORTING_LAG_MONTHS,
    )


def _is_likely_release_day(value: date) -> bool:
    """Return True on the final weekday of the month, excluding holiday logic."""
    first_next_month = scrape._add_months(value.replace(day=1), 1)
    last_weekday = first_next_month - timedelta(days=1)
    while last_weekday.weekday() >= 5:
        last_weekday -= timedelta(days=1)
    return value == last_weekday


def _normalize_month(value: date | datetime | str) -> date:
    if isinstance(value, datetime):
        return value.date().replace(day=1)
    if isinstance(value, date):
        return value.replace(day=1)
    return pd.to_datetime(value).date().replace(day=1)


if __name__ == "__main__":
    main()
