"""Orchestrate ERCOT DAM Settlement Point Prices."""

from __future__ import annotations

import logging
from collections.abc import Iterable
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Any
from uuid import uuid4

import pandas as pd
from dateutil.relativedelta import relativedelta

from backend import credentials
from backend.scrapes.power.ercot import dam_stlmnt_pnt_prices as scrape
from backend.utils import email_notifications, script_logging
from backend.utils.data_availability import emit_data_availability_event
from backend.utils.ops_logging import redact_secrets


API_SCRAPE_NAME = scrape.API_SCRAPE_NAME
TARGET_DATABASE: str | None = None
TARGET_SCHEMA = scrape.TARGET_SCHEMA
TARGET_TABLE = scrape.TARGET_TABLE
TARGET_TABLE_FQN = scrape.TARGET_TABLE_FQN
DATASET_NAME = "ercot_dam_stlmnt_pnt_prices"
DATA_SOURCE_SYSTEM = "ercot"
DATA_AVAILABILITY_TYPE = "data_ready"
DATA_SCOPE = "hub"
DATA_GRAIN = "date_hour_settlementpoint"
LOCAL_MARKET_TIMEZONE = "America/Chicago"
DEFAULT_SETTLEMENT_POINTS = scrape.DEFAULT_SETTLEMENT_POINTS
DEFAULT_DELTA = relativedelta(days=1)
DEFAULT_LOOKAHEAD_DAYS = 0

logger = logging.getLogger(__name__)


def main(
    start_date: datetime | None = None,
    end_date: datetime | None = None,
    delta: relativedelta = DEFAULT_DELTA,
    settlement_points: Iterable[str] = DEFAULT_SETTLEMENT_POINTS,
    database: str | None = None,
    run_mode: str = "scheduled",
    metadata: dict[str, Any] | None = None,
) -> pd.DataFrame | None:
    """Run the ERCOT DAM SPP workflow and emit readiness events."""
    start_date = start_date or (
        datetime.now() + relativedelta(days=DEFAULT_LOOKAHEAD_DAYS)
    )
    end_date = end_date or start_date
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
    settlement_points = tuple(settlement_points)

    try:
        run_logger.header(API_SCRAPE_NAME)
        run_logger.info(f"Run ID: {run_id}")
        run_logger.info(f"Run mode: {run_mode}")
        run_logger.info(f"Settlement points: {', '.join(settlement_points)}")
        fetch_metadata = {"run_mode": run_mode, **(metadata or {})}

        current_date = start_date
        while current_date <= end_date:
            run_logger.section(f"Pulling data for {current_date:%Y-%m-%d}...")
            df = scrape._pull(
                start_date=current_date,
                end_date=current_date,
                settlement_points=settlement_points,
                run_id=run_id,
                database=database,
                metadata=fetch_metadata,
            )

            if df.empty:
                run_logger.section(f"No data returned for {current_date:%Y-%m-%d}.")
            else:
                run_logger.section(f"Upserting {len(df)} rows...")
                scrape._upsert(df, database=database)
                rows_processed += len(df)
                frames.append(df)
                run_logger.success(
                    f"Successfully pulled and upserted data for {current_date:%Y-%m-%d}."
                )

            current_date += delta

        run_logger.section("Emitting data availability event(s) ...")
        combined_df = pd.concat(frames, ignore_index=True) if frames else pd.DataFrame()
        events = _emit_data_availability_events(
            df=combined_df,
            run_id=run_id,
            database=database,
            settlement_points=settlement_points,
        )
        if events:
            for event in events:
                status = "created" if event.get("created") else "already existed"
                run_logger.info(
                    f"Data availability event {event['event_key']} {status}."
                )
        else:
            run_logger.info(
                "No complete ERCOT DAM SPP business date detected; "
                "no data availability event emitted."
            )

        run_logger.section("Handling release email notification(s) ...")
        _notify_da_email_release_events(
            events=events,
            run_mode=run_mode,
            database=database,
            run_logger=run_logger,
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


def _notify_da_email_release_events(
    *,
    events: list[dict[str, Any]],
    run_mode: str,
    database: str | None,
    run_logger: Any,
) -> int:
    if run_mode != "scheduled":
        run_logger.info("Skipping ERCOT DAM release emails outside scheduled mode.")
        return 0
    if not events:
        return 0

    queued = 0
    try:
        for event in events:
            enqueued_rows = email_notifications.enqueue_da_lmp_release_notifications(
                iso="ercot",
                event=event,
                database=database,
            )
            queued += sum(1 for row in enqueued_rows if row.get("created"))

        if not email_notifications.notifications_enabled():
            run_logger.info(
                "ERCOT DAM release email notifications "
                f"queued={queued}; sending is disabled."
            )
            return queued

        processed = email_notifications.send_due_email_notifications(
            limit=20,
            database=database,
        )
        run_logger.info(
            "ERCOT DAM release email notifications "
            f"queued={queued}, processed={len(processed)}."
        )
    except Exception:
        run_logger.exception(
            "ERCOT DAM release email notification handling failed; "
            "scrape data and readiness events remain committed."
        )

    return queued


def _emit_data_availability_events(
    df: pd.DataFrame,
    run_id: str | None,
    database: str | None = TARGET_DATABASE,
    settlement_points: Iterable[str] = DEFAULT_SETTLEMENT_POINTS,
) -> list[dict[str, Any]]:
    """Emit one readiness event per complete ERCOT DAM delivery date."""
    if df.empty:
        logger.info("No ERCOT DAM SPP rows available for readiness emission")
        return []

    required_columns = {
        "deliverydate",
        "hourending",
        "settlementpoint",
        "settlementpointprice",
    }
    missing_columns = required_columns - set(df.columns)
    if missing_columns:
        raise ValueError(
            "Cannot assess ERCOT DAM SPP data readiness; missing columns: "
            f"{sorted(missing_columns)}"
        )

    current_df = df.copy()
    current_df["deliverydate"] = pd.to_datetime(current_df["deliverydate"]).dt.date
    current_df["hourending"] = pd.to_numeric(
        current_df["hourending"],
        errors="coerce",
    )
    settlement_point_set = {str(point).strip() for point in settlement_points}
    current_df = current_df.loc[
        current_df["settlementpoint"].isin(settlement_point_set)
    ].copy()

    emitted: list[dict[str, Any]] = []
    for business_date, date_df in sorted(current_df.groupby("deliverydate")):
        event = _emit_data_availability_event_for_date(
            business_date=business_date,
            date_df=date_df,
            run_id=run_id,
            database=database,
            settlement_points=settlement_point_set,
        )
        if event:
            emitted.append(event)

    return emitted


def _emit_data_availability_event_for_date(
    *,
    business_date: date,
    date_df: pd.DataFrame,
    run_id: str | None,
    database: str | None,
    settlement_points: set[str],
) -> dict[str, Any] | None:
    expected_period_count = _expected_period_count_for_date(business_date)
    expected_entity_count = len(settlement_points)
    row_count = int(len(date_df))
    entity_count = int(date_df["settlementpoint"].nunique())
    period_count = int(date_df["hourending"].nunique())
    periods_per_entity = date_df.groupby("settlementpoint")["hourending"].nunique()
    min_periods_per_entity = int(periods_per_entity.min()) if entity_count else 0
    max_periods_per_entity = int(periods_per_entity.max()) if entity_count else 0
    duplicate_entity_period_rows = int(
        date_df.duplicated(["settlementpoint", "hourending"]).sum()
    )
    expected_row_count = expected_entity_count * expected_period_count

    is_complete = (
        entity_count == expected_entity_count
        and period_count == expected_period_count
        and min_periods_per_entity == expected_period_count
        and max_periods_per_entity == expected_period_count
        and row_count == expected_row_count
        and duplicate_entity_period_rows == 0
    )
    if not is_complete:
        logger.warning(
            "Skipping ERCOT DAM SPP readiness event for %s; incomplete rows "
            "(rows=%s, entities=%s/%s, periods=%s, expected_periods=%s, "
            "min_periods_per_entity=%s, max_periods_per_entity=%s, duplicates=%s)",
            business_date,
            row_count,
            entity_count,
            expected_entity_count,
            period_count,
            expected_period_count,
            min_periods_per_entity,
            max_periods_per_entity,
            duplicate_entity_period_rows,
        )
        return None

    event_key = _data_availability_event_key(business_date)
    window_start = _utc_timestamp(
        pd.Timestamp(business_date).tz_localize(LOCAL_MARKET_TIMEZONE)
    )
    window_end = _utc_timestamp(
        (pd.Timestamp(business_date) + pd.Timedelta(days=1)).tz_localize(
            LOCAL_MARKET_TIMEZONE
        )
    )
    payload = {
        "business_date": business_date.isoformat(),
        "expected_period_count": expected_period_count,
        "expected_entity_count": expected_entity_count,
        "expected_row_count": expected_row_count,
        "min_periods_per_entity": min_periods_per_entity,
        "max_periods_per_entity": max_periods_per_entity,
        "duplicate_entity_period_rows": duplicate_entity_period_rows,
        "settlement_points": sorted(settlement_points),
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
        source_table=TARGET_TABLE_FQN,
        row_count=row_count,
        entity_count=entity_count,
        period_count=period_count,
        completeness_status="complete",
        run_id=run_id,
        payload=payload,
        database=database,
    )


def _data_availability_event_key(business_date: date) -> str:
    return (
        f"{DATASET_NAME}:{DATA_AVAILABILITY_TYPE}:"
        f"{business_date.isoformat()}:{DATA_SCOPE}"
    )


def _expected_period_count_for_date(business_date: date) -> int:
    start = pd.Timestamp(business_date).tz_localize(LOCAL_MARKET_TIMEZONE)
    end = (pd.Timestamp(business_date) + pd.Timedelta(days=1)).tz_localize(
        LOCAL_MARKET_TIMEZONE
    )
    return int((end - start) / pd.Timedelta(hours=1))


def _utc_timestamp(value: Any) -> datetime:
    timestamp = pd.Timestamp(value)
    if timestamp.tzinfo is None:
        timestamp = timestamp.tz_localize(timezone.utc)
    else:
        timestamp = timestamp.tz_convert(timezone.utc)
    return timestamp.to_pydatetime()


if __name__ == "__main__":
    main()
