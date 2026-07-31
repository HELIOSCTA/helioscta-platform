"""Orchestrate EIA-930 daily region-data refreshes."""

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
from backend.scrapes.eia import eia_930_daily_region_data as scrape
from backend.utils import script_logging
from backend.utils.ops_logging import redact_secrets


API_SCRAPE_NAME = scrape.API_SCRAPE_NAME
DEFAULT_RUN_MODE = "scheduled"
DEFAULT_METADATA = {
    "schedule_reason": "rolling_eia_930_daily_region_data_refresh",
}
LOCAL_MARKET_TIMEZONE = "America/New_York"
POLL_CEILING_SECONDS = 4 * 60 * 60 + 30 * 60
POLL_WAIT_SECONDS = 15 * 60
DEFAULT_REQUIRED_TYPES = ("D",)


def main(
    start_date: date | datetime | str | None = None,
    end_date: date | datetime | str | None = None,
    target_date: date | datetime | str | None = None,
    timezones: tuple[str, ...] = scrape.DEFAULT_TIMEZONES,
    types: tuple[str, ...] = scrape.DEFAULT_TYPES,
    respondents: tuple[str, ...] | None = scrape.DEFAULT_RESPONDENTS,
    database: str | None = None,
    run_mode: str = DEFAULT_RUN_MODE,
    metadata: dict[str, Any] | None = None,
    poll_until_available: bool | None = None,
    poll_ceiling_seconds: int = POLL_CEILING_SECONDS,
    poll_wait_seconds: int = POLL_WAIT_SECONDS,
    sleep_fn: Callable[[float], None] = time.sleep,
) -> pd.DataFrame | None:
    """Run the promoted EIA-930 daily region-data workflow."""
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
            resolved_target_date = _resolve_target_date(
                target_date=target_date,
                end_date=end_date,
            )
            run_logger.info(f"Target EIA-930 date: {resolved_target_date.isoformat()}")
            run_logger.info(
                "Polling window: "
                f"{poll_ceiling_seconds // 60}m ceiling, "
                f"{poll_wait_seconds}s interval"
            )
            run_logger.section(
                f"Waiting for daily EIA-930 region rows for {resolved_target_date}..."
            )
            df = _poll_for_target_date(
                target_date=resolved_target_date,
                start_date=start_date,
                end_date=end_date,
                timezones=timezones,
                types=types,
                respondents=respondents,
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
                timezones=timezones,
                types=types,
                respondents=respondents,
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


def _poll_for_target_date(
    *,
    target_date: date,
    start_date: date | datetime | str | None,
    end_date: date | datetime | str | None,
    timezones: tuple[str, ...],
    types: tuple[str, ...],
    respondents: tuple[str, ...] | None,
    run_id: str | None,
    database: str | None,
    metadata: dict[str, Any],
    poll_ceiling_seconds: int,
    poll_wait_seconds: int,
    sleep_fn: Callable[[float], None],
) -> pd.DataFrame:
    required_types = tuple(item for item in DEFAULT_REQUIRED_TYPES if item in types)
    return _polling.poll_until_available(
        pipeline_name=API_SCRAPE_NAME,
        route=scrape.ROUTE,
        target_table=scrape.TARGET_TABLE_FQN,
        run_id=run_id,
        database=database,
        metadata={
            **metadata,
            "target_period": target_date.isoformat(),
            "poll_ceiling_seconds": poll_ceiling_seconds,
            "poll_wait_seconds": poll_wait_seconds,
            "required_types": list(required_types),
        },
        fetch_once=lambda poll_count: scrape._pull(
            start_date=start_date,
            end_date=end_date,
            timezones=timezones,
            types=types,
            respondents=respondents,
            run_id=run_id,
            database=database,
            metadata={
                **metadata,
                "target_period": target_date.isoformat(),
                "poll_count": poll_count,
            },
        ),
        check_available=lambda df: _daily_availability(
            df,
            target_date,
            required_types=required_types,
        ),
        poll_ceiling_seconds=poll_ceiling_seconds,
        poll_wait_seconds=poll_wait_seconds,
        sleep_fn=sleep_fn,
    )


def _daily_availability(
    df: pd.DataFrame,
    target_date: date,
    required_types: tuple[str, ...] = DEFAULT_REQUIRED_TYPES,
) -> _polling.AvailabilityResult:
    if df.empty:
        return _polling.AvailabilityResult(
            is_available=False,
            message=f"EIA-930 daily region data is not available for {target_date}.",
            metadata={"target_period": target_date.isoformat(), "target_row_count": 0},
        )

    current_df = df.copy()
    current_df["period"] = pd.to_datetime(current_df["period"], errors="coerce").dt.date
    target_df = current_df.loc[current_df["period"] == target_date]
    target_types = set(target_df["type"].dropna().astype(str))
    missing_types = sorted(set(required_types).difference(target_types))
    target_row_count = int(len(target_df))
    metadata = {
        "target_period": target_date.isoformat(),
        "target_row_count": target_row_count,
        "target_respondent_count": int(target_df["respondent"].nunique()),
        "target_type_count": int(target_df["type"].nunique()),
        "target_timezone_count": int(target_df["timezone"].nunique()),
        "required_types": list(required_types),
        "missing_required_types": missing_types,
    }
    if target_row_count > 0 and not missing_types:
        return _polling.AvailabilityResult(
            is_available=True,
            message="target EIA-930 daily region data is available",
            metadata=metadata,
        )
    return _polling.AvailabilityResult(
        is_available=False,
        message=f"EIA-930 daily region data is not available for {target_date}.",
        metadata=metadata,
    )


def _resolve_target_date(
    *,
    target_date: date | datetime | str | None,
    end_date: date | datetime | str | None,
    now: datetime | None = None,
) -> date:
    if target_date is not None:
        return _normalize_date(target_date)
    if end_date is not None:
        return _normalize_date(end_date)
    now = now or datetime.now(ZoneInfo(LOCAL_MARKET_TIMEZONE))
    return now.date() - timedelta(days=1)


def _normalize_date(value: date | datetime | str) -> date:
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    return pd.to_datetime(value).date()


if __name__ == "__main__":
    main()
