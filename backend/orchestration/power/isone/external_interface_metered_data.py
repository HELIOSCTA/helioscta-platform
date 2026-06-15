"""Orchestrate ISO-NE External Interface Metered Data."""
from __future__ import annotations

import logging
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Any
from uuid import uuid4
from zoneinfo import ZoneInfo

import pandas as pd
from dateutil.relativedelta import relativedelta

from backend import credentials
from backend.scrapes.power.isone import external_interface_metered_data as scrape
from backend.utils import script_logging
from backend.utils.data_availability import emit_data_availability_event
from backend.utils.ops_logging import redact_secrets


API_SCRAPE_NAME = scrape.API_SCRAPE_NAME
TARGET_DATABASE: str | None = None
TARGET_SCHEMA = scrape.TARGET_SCHEMA
TARGET_TABLE = scrape.TARGET_TABLE
TARGET_TABLE_FQN = scrape.TARGET_TABLE_FQN
DATASET_NAME = "isone_external_interface_metered_data"
DATA_SOURCE_SYSTEM = "isone"
DATA_AVAILABILITY_TYPE = "data_ready"
DATA_SCOPE = "all_interfaces"
DATA_GRAIN = "date_hour_entity_interface"
LOCAL_MARKET_TIMEZONE = "America/New_York"
DEFAULT_DELTA = relativedelta(years=1)

logger = logging.getLogger(__name__)


def _local_now() -> datetime:
    return datetime.now(ZoneInfo(LOCAL_MARKET_TIMEZONE)).replace(tzinfo=None)


def main(
    start_date: date | datetime | str | None = None,
    end_date: date | datetime | str | None = None,
    delta: relativedelta = DEFAULT_DELTA,
    database: str | None = None,
    run_mode: str = "scheduled",
    metadata: dict[str, Any] | None = None,
) -> pd.DataFrame | None:
    """Run the ISO-NE External Interface Metered Data workflow."""
    del delta  # Annual workbook pulls are grouped by report year.
    current_market_date = _local_now().date()
    start_date = scrape._coerce_date(start_date or date(current_market_date.year, 1, 1))
    end_date = scrape._coerce_date(end_date or (current_market_date - relativedelta(days=1)))
    database = database or credentials.AZURE_POSTGRESQL_DB_NAME
    run_logger = script_logging.init_logging(
        name=API_SCRAPE_NAME,
        log_dir=script_logging.get_log_dir(Path(__file__).parent / "logs"),
        log_to_file=True,
        delete_if_no_errors=True,
    )
    rows_processed = 0
    combined_df = pd.DataFrame()
    run_id = str(uuid4())

    try:
        run_logger.header(API_SCRAPE_NAME)
        run_logger.info(f"Run ID: {run_id}")
        run_logger.info(f"Run mode: {run_mode}")
        run_logger.section(
            f"Pulling External Interface Metered Data for "
            f"{start_date:%Y-%m-%d} through {end_date:%Y-%m-%d}..."
        )
        combined_df = scrape._pull(
            start_date=start_date,
            end_date=end_date,
            run_id=run_id,
            database=database,
            metadata={"run_mode": run_mode, **(metadata or {})},
        )
        if combined_df.empty:
            run_logger.section("No data returned.")
        else:
            run_logger.section(f"Upserting {len(combined_df)} rows...")
            scrape._upsert(df=combined_df, database=database)
            rows_processed = len(combined_df)

        run_logger.section("Emitting data availability event(s) ...")
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
                "No complete ISO-NE External Interface Metered Data date detected; "
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
    df: pd.DataFrame,
    run_id: str | None,
    database: str | None = TARGET_DATABASE,
) -> list[dict[str, Any]]:
    """Emit one readiness event per complete ISO-NE metered interchange date."""
    if df.empty:
        logger.info("No ISO-NE External Interface Metered Data rows available")
        return []

    required_columns = {
        "local_date",
        "local_hour_ending",
        "entity_type",
        "interface_name",
    }
    missing_columns = required_columns - set(df.columns)
    if missing_columns:
        raise ValueError(
            "Cannot assess ISO-NE External Interface Metered Data readiness; "
            f"missing columns: {sorted(missing_columns)}"
        )

    current_df = df.copy()
    current_df["local_date"] = pd.to_datetime(current_df["local_date"]).dt.date
    current_df["local_hour_ending"] = pd.to_numeric(
        current_df["local_hour_ending"],
        errors="coerce",
    )
    current_df = current_df.dropna(
        subset=["local_date", "local_hour_ending", "entity_type", "interface_name"]
    )
    current_df["local_hour_ending"] = current_df["local_hour_ending"].astype(int)
    current_df["entity_key"] = (
        current_df["entity_type"].astype(str)
        + ":"
        + current_df["interface_name"].astype(str)
    )

    emitted: list[dict[str, Any]] = []
    for business_date, date_df in sorted(current_df.groupby("local_date")):
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
    entity_count = int(date_df["entity_key"].nunique())
    period_count = int(date_df["local_hour_ending"].nunique())
    periods_per_entity = date_df.groupby("entity_key")[
        "local_hour_ending"
    ].nunique()
    min_periods_per_entity = int(periods_per_entity.min()) if entity_count else 0
    max_periods_per_entity = int(periods_per_entity.max()) if entity_count else 0
    duplicate_entity_period_rows = int(
        date_df.duplicated(["entity_key", "local_hour_ending"]).sum()
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
            "Skipping ISO-NE External Interface Metered Data readiness event for "
            "%s; incomplete rows (rows=%s, entities=%s, periods=%s, "
            "expected_periods=%s, min_periods_per_entity=%s, "
            "max_periods_per_entity=%s, duplicates=%s)",
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
