"""Orchestrate ISO-NE hourly system demand."""
from __future__ import annotations

import logging
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Any
from zoneinfo import ZoneInfo

import pandas as pd
from dateutil.relativedelta import relativedelta

from backend import credentials
from backend.scrapes.power.isone import hourly_system_demand as scrape
from backend.utils import script_logging
from backend.utils.data_availability import emit_data_availability_event
from backend.utils.ops_logging import PipelineRunLogger, redact_secrets


API_SCRAPE_NAME = scrape.API_SCRAPE_NAME
TARGET_DATABASE: str | None = None
TARGET_SCHEMA = scrape.TARGET_SCHEMA
TARGET_TABLE = scrape.TARGET_TABLE
TARGET_TABLE_FQN = scrape.TARGET_TABLE_FQN
DATASET_NAME = "isone_hourly_system_demand"
DATA_SOURCE_SYSTEM = "isone"
DATA_AVAILABILITY_TYPE = "data_ready"
DATA_SCOPE = "system"
DATA_GRAIN = "date_hour"
LOCAL_MARKET_TIMEZONE = "America/New_York"
DEFAULT_DELTA = relativedelta(days=1)
DEFAULT_LOOKBACK_DAYS = 1

logger = logging.getLogger(__name__)


def _local_now() -> datetime:
    return datetime.now(ZoneInfo(LOCAL_MARKET_TIMEZONE)).replace(tzinfo=None)


def main(
    start_date: datetime | None = None,
    end_date: datetime | None = None,
    delta: relativedelta = DEFAULT_DELTA,
    database: str | None = None,
    run_mode: str = "scheduled",
    metadata: dict[str, Any] | None = None,
) -> pd.DataFrame | None:
    """Run the ISO-NE hourly system demand workflow."""
    target_day = _local_now() - relativedelta(days=DEFAULT_LOOKBACK_DAYS)
    start_date = start_date or target_day
    end_date = end_date or target_day
    database = database or credentials.AZURE_POSTGRESQL_DB_NAME
    run_logger = script_logging.init_logging(
        name=API_SCRAPE_NAME,
        log_dir=script_logging.get_log_dir(Path(__file__).parent / "logs"),
        log_to_file=True,
        delete_if_no_errors=True,
    )
    rows_processed = 0
    frames: list[pd.DataFrame] = []
    combined_df = pd.DataFrame()
    pipeline_run = PipelineRunLogger(
        pipeline_name=API_SCRAPE_NAME,
        source="power",
        target_table=TARGET_TABLE_FQN,
        operation_type="upsert",
        log_file_path=run_logger.log_file_path,
        database=database,
    )
    pipeline_run.start()
    run_id = pipeline_run.run_id

    try:
        run_logger.header(API_SCRAPE_NAME)
        run_logger.info(f"Run ID: {run_id}")
        run_logger.info(f"Run mode: {run_mode}")
        fetch_metadata = {"run_mode": run_mode, **(metadata or {})}

        current_date = start_date
        while current_date <= end_date:
            run_logger.section(f"Pulling data for {current_date:%Y-%m-%d}...")
            df = scrape._pull(
                start_date=current_date,
                end_date=current_date,
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
        )
        if events:
            for event in events:
                status = "created" if event.get("created") else "already existed"
                run_logger.info(f"Data availability event {event['event_key']} {status}.")
        else:
            run_logger.info(
                "No complete ISO-NE hourly system demand date detected; "
                "no data availability event emitted."
            )

        pipeline_run.success(rows_processed=rows_processed)
        run_logger.success(
            f"{API_SCRAPE_NAME} completed; {rows_processed} rows processed."
        )

    except Exception as exc:
        run_logger.exception(f"Pipeline failed: {redact_secrets(str(exc))}")
        pipeline_run.failure(error=exc, rows_processed=rows_processed)
        raise

    finally:
        script_logging.close_logging()

    return combined_df if not combined_df.empty else None


def _emit_data_availability_events(
    df: pd.DataFrame,
    run_id: str | None,
    database: str | None = TARGET_DATABASE,
) -> list[dict[str, Any]]:
    """Emit one readiness event per complete ISO-NE system demand date."""
    if df.empty:
        logger.info("No ISO-NE hourly system demand rows available")
        return []

    missing_columns = {"date", "hour_ending"} - set(df.columns)
    if missing_columns:
        raise ValueError(
            "Cannot assess ISO-NE hourly system demand readiness; missing columns: "
            f"{sorted(missing_columns)}"
        )

    current_df = df.copy()
    current_df["date"] = pd.to_datetime(current_df["date"]).dt.date
    current_df["hour_ending"] = pd.to_numeric(
        current_df["hour_ending"],
        errors="coerce",
    )
    current_df = current_df.dropna(subset=["date", "hour_ending"])
    current_df["hour_ending"] = current_df["hour_ending"].astype(int)

    emitted: list[dict[str, Any]] = []
    for business_date, date_df in sorted(current_df.groupby("date")):
        event = _emit_data_availability_event_for_date(
            business_date=business_date,
            date_df=date_df,
            run_id=run_id,
            database=database,
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
) -> dict[str, Any] | None:
    expected_period_count = _expected_period_count_for_date(business_date)
    row_count = int(len(date_df))
    period_count = int(date_df["hour_ending"].nunique())
    duplicate_period_rows = int(date_df.duplicated(["hour_ending"]).sum())
    is_complete = (
        period_count == expected_period_count
        and row_count == expected_period_count
        and duplicate_period_rows == 0
    )
    if not is_complete:
        logger.warning(
            "Skipping ISO-NE hourly system demand readiness event for %s; "
            "incomplete rows (rows=%s, periods=%s, expected_periods=%s, "
            "duplicates=%s)",
            business_date,
            row_count,
            period_count,
            expected_period_count,
            duplicate_period_rows,
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
        "duplicate_period_rows": duplicate_period_rows,
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
        entity_count=1,
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
