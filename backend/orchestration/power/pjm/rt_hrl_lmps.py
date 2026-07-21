"""Orchestrate PJM verified hourly Real-Time LMPs after source publication."""

from __future__ import annotations

import logging
import sys
import time
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Any
from urllib.parse import urlsplit
from uuid import uuid4
from zoneinfo import ZoneInfo

import pandas as pd

REPO_ROOT = Path(__file__).resolve().parents[4]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from backend import credentials
from backend.orchestration.power.pjm._policies import (
    DataNotYetAvailable,
    api_poll_policy,
)
from backend.scrapes.power.pjm import client
from backend.scrapes.power.pjm import rt_hrl_lmps as scrape
from backend.utils.data_availability import emit_data_availability_event
from backend.utils.ops_logging import log_api_fetch, redact_secrets

logger = logging.getLogger(__name__)

DEFAULT_RUN_MODE = "scheduled_post_publish"
DEFAULT_METADATA = {
    "scheduler": "helios-pjm-rt-hrl-lmps.timer",
    "schedule_reason": "poll_pjm_verified_rt_hourly_lmp_publication_window",
}
DATASET_NAME = "pjm_rt_hrl_lmps"
DATA_SOURCE_SYSTEM = "pjm"
DATA_AVAILABILITY_TYPE = "data_ready"
DATA_SCOPE = "hub"
DATA_GRAIN = "date_hour_hub"
LOCAL_MARKET_TIMEZONE = "America/New_York"
POLL_CEILING_SECONDS = 5 * 60 * 60
POLL_WAIT_SECONDS = 5 * 60


def _target_market_date(value: date | datetime | str | None = None) -> date:
    if value is not None:
        if isinstance(value, datetime):
            return value.date()
        if isinstance(value, date):
            return value
        return date.fromisoformat(value)

    current = datetime.now(ZoneInfo(LOCAL_MARKET_TIMEZONE)).date()
    target = current - timedelta(days=1)
    while target.weekday() >= 5:
        target -= timedelta(days=1)
    return target


def _window_for_market_date(target_date: date) -> tuple[str, str]:
    return (
        target_date.strftime("%Y-%m-%d 00:00"),
        target_date.strftime("%Y-%m-%d 23:00"),
    )


def _expected_period_count_for_date(target_date: date) -> int:
    start = pd.Timestamp(target_date).tz_localize(LOCAL_MARKET_TIMEZONE)
    end = (pd.Timestamp(target_date) + pd.Timedelta(days=1)).tz_localize(
        LOCAL_MARKET_TIMEZONE
    )
    return int((end - start) / pd.Timedelta(hours=1))


def _market_day_shape(df: pd.DataFrame, target_date: date) -> dict[str, Any]:
    expected_period_count = _expected_period_count_for_date(target_date)
    if df.empty:
        return {
            "is_available": False,
            "row_count": 0,
            "period_count": 0,
            "expected_period_count": expected_period_count,
            "pnode_count": 0,
            "duplicate_key_count": 0,
        }

    day_df = df.loc[
        pd.to_datetime(df["datetime_beginning_ept"]).dt.date == target_date
    ].copy()
    duplicate_key_count = int(day_df.duplicated(scrape.PRIMARY_KEY).sum())
    period_count = int(day_df["datetime_beginning_utc"].nunique())
    pnode_count = int(day_df["pnode_name"].nunique())
    return {
        "is_available": (
            len(day_df) > 0
            and period_count == expected_period_count
            and duplicate_key_count == 0
        ),
        "row_count": int(len(day_df)),
        "period_count": period_count,
        "expected_period_count": expected_period_count,
        "pnode_count": pnode_count,
        "duplicate_key_count": duplicate_key_count,
    }


@api_poll_policy(max_seconds=POLL_CEILING_SECONDS, wait_seconds=POLL_WAIT_SECONDS)
def _wait_for_available_market_day(
    *,
    target_date: date,
    database: str | None,
) -> pd.DataFrame:
    window_start, window_end = _window_for_market_date(target_date)
    df = scrape._pull(
        start_date=window_start,
        end_date=window_end,
        database=database,
        log_fetch=False,
    )
    shape = _market_day_shape(df, target_date)
    if not shape["is_available"]:
        raise DataNotYetAvailable(
            "PJM rt_hrl_lmps is not available for "
            f"{target_date.isoformat()} "
            f"(rows={shape['row_count']}, periods={shape['period_count']}, "
            f"expected_periods={shape['expected_period_count']}, "
            f"pnodes={shape['pnode_count']}, "
            f"duplicate_keys={shape['duplicate_key_count']})"
        )
    return df


def _poll_count() -> int:
    stats = getattr(_wait_for_available_market_day, "statistics", {}) or {}
    return int(stats.get("attempt_number", 1))


def _wait_for_available_market_day_logged(
    *,
    target_date: date,
    run_id: str | None,
    database: str | None,
    metadata: dict[str, Any] | None = None,
) -> pd.DataFrame:
    parsed_url = urlsplit(f"{client.BASE_URL}{scrape.API_SCRAPE_NAME}")
    started = time.perf_counter()

    try:
        df = _wait_for_available_market_day(
            target_date=target_date,
            database=database,
        )
    except Exception as exc:
        elapsed_ms = round((time.perf_counter() - started) * 1000)
        log_api_fetch(
            actor_type="scrape",
            provider="pjm",
            pipeline_name=scrape.API_SCRAPE_NAME,
            run_id=run_id,
            operation_name=f"{scrape.API_SCRAPE_NAME}_poll",
            target_table=scrape.TARGET_TABLE_FQN,
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
                "poll_ceiling_seconds": POLL_CEILING_SECONDS,
                "poll_wait_seconds": POLL_WAIT_SECONDS,
            },
            database=database,
        )
        raise

    elapsed_ms = round((time.perf_counter() - started) * 1000)
    shape = _market_day_shape(df, target_date)
    log_api_fetch(
        actor_type="scrape",
        provider="pjm",
        pipeline_name=scrape.API_SCRAPE_NAME,
        run_id=run_id,
        operation_name=f"{scrape.API_SCRAPE_NAME}_poll",
        target_table=scrape.TARGET_TABLE_FQN,
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
            "poll_ceiling_seconds": POLL_CEILING_SECONDS,
            "poll_wait_seconds": POLL_WAIT_SECONDS,
            **shape,
        },
        database=database,
    )
    return df


def _emit_data_availability_events(
    *,
    df: pd.DataFrame,
    target_date: date,
    run_id: str | None,
    database: str | None,
) -> list[dict[str, Any]]:
    """Emit one readiness event for the complete verified RT hub market date."""
    if df.empty:
        logger.info("No RT HRL LMP rows available for readiness emission")
        return []

    required_columns = {
        "datetime_beginning_utc",
        "datetime_beginning_ept",
        "pnode_id",
        "row_is_current",
    }
    missing_columns = required_columns - set(df.columns)
    if missing_columns:
        raise ValueError(
            "Cannot assess RT HRL LMP data readiness; missing columns: "
            f"{sorted(missing_columns)}"
        )

    current_df = df.loc[_is_current_mask(df)].copy()
    if current_df.empty:
        logger.info("No current RT HRL LMP rows available for readiness emission")
        return []

    current_df["datetime_beginning_utc"] = pd.to_datetime(
        current_df["datetime_beginning_utc"]
    )
    current_df["datetime_beginning_ept"] = pd.to_datetime(
        current_df["datetime_beginning_ept"]
    )
    current_df["business_date"] = current_df["datetime_beginning_ept"].dt.date
    date_df = current_df.loc[current_df["business_date"] == target_date].copy()
    if date_df.empty:
        logger.info(
            "No current RT HRL LMP rows available for target market date %s",
            target_date,
        )
        return []

    event = _emit_data_availability_event_for_date(
        business_date=target_date,
        date_df=date_df,
        run_id=run_id,
        database=database,
    )
    return [event] if event else []


def _emit_data_availability_event_for_date(
    *,
    business_date: date,
    date_df: pd.DataFrame,
    run_id: str | None,
    database: str | None,
) -> dict[str, Any] | None:
    expected_period_count = _expected_period_count_for_date(business_date)
    row_count = int(len(date_df))
    entity_count = int(date_df["pnode_id"].nunique())
    period_count = int(date_df["datetime_beginning_utc"].nunique())
    periods_per_entity = date_df.groupby("pnode_id")["datetime_beginning_utc"].nunique()
    min_periods_per_entity = int(periods_per_entity.min()) if entity_count else 0
    max_periods_per_entity = int(periods_per_entity.max()) if entity_count else 0
    duplicate_entity_period_rows = int(
        date_df.duplicated(["pnode_id", "datetime_beginning_utc"]).sum()
    )
    expected_row_count = entity_count * expected_period_count

    is_complete = (
        entity_count > 0
        and period_count == expected_period_count
        and min_periods_per_entity == expected_period_count
        and max_periods_per_entity == expected_period_count
        and row_count == expected_row_count
        and duplicate_entity_period_rows == 0
    )
    if not is_complete:
        logger.warning(
            "Skipping RT HRL LMP readiness event for %s; incomplete current rows "
            "(rows=%s, entities=%s, periods=%s, expected_periods=%s, "
            "min_periods_per_entity=%s, max_periods_per_entity=%s, duplicates=%s)",
            business_date,
            row_count,
            entity_count,
            period_count,
            expected_period_count,
            min_periods_per_entity,
            max_periods_per_entity,
            duplicate_entity_period_rows,
        )
        return None

    event_key = _data_availability_event_key(business_date)
    window_start = _utc_timestamp(date_df["datetime_beginning_utc"].min())
    window_end = _utc_timestamp(
        date_df["datetime_beginning_utc"].max() + pd.Timedelta(hours=1)
    )
    payload = {
        "business_date": business_date.isoformat(),
        "expected_period_count": expected_period_count,
        "expected_row_count": expected_row_count,
        "min_periods_per_entity": min_periods_per_entity,
        "max_periods_per_entity": max_periods_per_entity,
        "duplicate_entity_period_rows": duplicate_entity_period_rows,
        "window_end_convention": "exclusive",
    }

    return emit_data_availability_event(
        event_key=event_key,
        dataset=DATASET_NAME,
        source_system=DATA_SOURCE_SYSTEM,
        availability_type=DATA_AVAILABILITY_TYPE,
        business_date=business_date,
        window_start=window_start,
        window_end=window_end,
        scope=DATA_SCOPE,
        grain=DATA_GRAIN,
        source_table=scrape.TARGET_TABLE_FQN,
        row_count=row_count,
        entity_count=entity_count,
        period_count=period_count,
        completeness_status="complete",
        run_id=run_id,
        payload=payload,
        database=database,
    )


def _is_current_mask(df: pd.DataFrame) -> pd.Series:
    values = df["row_is_current"]
    if pd.api.types.is_bool_dtype(values):
        return values.fillna(False)
    return (
        values.astype(str)
        .str.strip()
        .str.lower()
        .isin({"true", "t", "1", "yes", "y"})
    )


def _data_availability_event_key(business_date: date) -> str:
    return (
        f"{DATASET_NAME}:{DATA_AVAILABILITY_TYPE}:"
        f"{business_date.isoformat()}:{DATA_SCOPE}"
    )


def _utc_timestamp(value: Any) -> datetime:
    timestamp = pd.Timestamp(value)
    if timestamp.tzinfo is None:
        timestamp = timestamp.tz_localize(timezone.utc)
    else:
        timestamp = timestamp.tz_convert(timezone.utc)
    return timestamp.to_pydatetime()


def main(
    target_date: date | datetime | str | None = None,
    database: str | None = None,
    run_mode: str = DEFAULT_RUN_MODE,
    metadata: dict[str, Any] | None = None,
) -> int:
    """Poll for verified hourly RT LMP publication, then run the scrape."""
    database = database or credentials.AZURE_POSTGRESQL_DB_NAME
    market_date = _target_market_date(target_date)
    run_id = str(uuid4())
    fetch_metadata = {
        **DEFAULT_METADATA,
        "target_market_date": market_date.isoformat(),
        "poll_ceiling_seconds": POLL_CEILING_SECONDS,
        "poll_wait_seconds": POLL_WAIT_SECONDS,
        **(metadata or {}),
    }
    available_df = _wait_for_available_market_day_logged(
        target_date=market_date,
        run_id=run_id,
        database=database,
        metadata={"run_mode": run_mode, **fetch_metadata},
    )
    scrape.main(database=database, run_mode=run_mode, metadata=fetch_metadata)
    _emit_data_availability_events(
        df=available_df,
        target_date=market_date,
        run_id=run_id,
        database=database,
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
