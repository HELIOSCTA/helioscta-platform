"""Orchestrate ISO-NE day-ahead hourly LMPs."""
from __future__ import annotations

import logging
import time
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Any
from urllib.parse import urlsplit
from uuid import uuid4
from zoneinfo import ZoneInfo

import pandas as pd
from dateutil.relativedelta import relativedelta

from backend import credentials
from backend.scrapes.power.isone import da_hrl_lmps as scrape
from backend.utils import email_notifications, script_logging
from backend.utils.data_availability import emit_data_availability_event
from backend.utils.ops_logging import log_api_fetch, redact_secrets


API_SCRAPE_NAME = scrape.API_SCRAPE_NAME
TARGET_DATABASE: str | None = None
TARGET_SCHEMA = scrape.TARGET_SCHEMA
TARGET_TABLE = scrape.TARGET_TABLE
TARGET_TABLE_FQN = scrape.TARGET_TABLE_FQN
DATASET_NAME = "isone_da_hrl_lmps"
DATA_SOURCE_SYSTEM = "isone"
DATA_AVAILABILITY_TYPE = "data_ready"
DATA_SCOPE = "internal_hub"
DATA_GRAIN = "date_hour_location"
LOCAL_MARKET_TIMEZONE = "America/New_York"
DEFAULT_DELTA = relativedelta(days=1)
DEFAULT_LOOKAHEAD_DAYS = 1
POLL_CEILING_SECONDS = 4 * 60 * 60
POLL_WAIT_SECONDS = 2 * 60

logger = logging.getLogger(__name__)


class DataNotYetAvailable(Exception):
    """Raised when ISO-NE has not published a complete DA market day."""


def _local_now() -> datetime:
    return datetime.now(ZoneInfo(LOCAL_MARKET_TIMEZONE)).replace(tzinfo=None)


def main(
    start_date: datetime | None = None,
    end_date: datetime | None = None,
    delta: relativedelta = DEFAULT_DELTA,
    database: str | None = None,
    run_mode: str = "scheduled",
    metadata: dict[str, Any] | None = None,
    poll_ceiling_seconds: int = POLL_CEILING_SECONDS,
    poll_wait_seconds: int = POLL_WAIT_SECONDS,
) -> pd.DataFrame | None:
    """Run the ISO-NE DA hourly LMP workflow and emit readiness events."""
    target_day = _local_now() + relativedelta(days=DEFAULT_LOOKAHEAD_DAYS)
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
    run_id = str(uuid4())

    try:
        run_logger.header(API_SCRAPE_NAME)
        run_logger.info(f"Run ID: {run_id}")
        run_logger.info(f"Run mode: {run_mode}")
        if run_mode == "scheduled":
            run_logger.info(
                "Polling window: "
                f"{poll_ceiling_seconds // 3600}h ceiling, "
                f"{poll_wait_seconds}s interval"
            )
        fetch_metadata = {"run_mode": run_mode, **(metadata or {})}

        current_date = start_date
        while current_date <= end_date:
            if run_mode == "scheduled":
                run_logger.section(
                    f"Waiting for complete data for {current_date:%Y-%m-%d}..."
                )
                df = _wait_for_complete_data_logged(
                    operating_date=current_date,
                    run_id=run_id,
                    database=database,
                    metadata=fetch_metadata,
                    poll_ceiling_seconds=poll_ceiling_seconds,
                    poll_wait_seconds=poll_wait_seconds,
                )
            else:
                run_logger.section(f"Pulling data for {current_date:%Y-%m-%d}...")
                df = scrape._pull(
                    start_date=current_date,
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
                "No complete ISO-NE DA LMP business date detected; "
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


def _wait_for_complete_data_logged(
    *,
    operating_date: date | datetime,
    run_id: str | None,
    database: str | None,
    metadata: dict[str, Any] | None = None,
    poll_ceiling_seconds: int = POLL_CEILING_SECONDS,
    poll_wait_seconds: int = POLL_WAIT_SECONDS,
) -> pd.DataFrame:
    business_date = _business_date(operating_date)
    parsed_url = urlsplit(
        scrape._build_url(start_date=pd.Timestamp(business_date).to_pydatetime())
    )
    started = time.perf_counter()
    poll_count = 0

    while True:
        poll_count += 1
        try:
            df = _fetch_complete_market_day(
                operating_date=business_date,
                run_id=run_id,
                database=database,
                metadata=metadata,
            )
        except DataNotYetAvailable as exc:
            elapsed_seconds = time.perf_counter() - started
            if elapsed_seconds >= poll_ceiling_seconds:
                _log_poll_result(
                    parsed_url=parsed_url,
                    run_id=run_id,
                    database=database,
                    metadata=metadata,
                    status="failure",
                    elapsed_seconds=elapsed_seconds,
                    poll_count=poll_count,
                    operating_date=business_date,
                    error_type=type(exc).__name__,
                    error_message=str(exc),
                )
                raise

            time.sleep(min(poll_wait_seconds, poll_ceiling_seconds - elapsed_seconds))
            continue
        except Exception as exc:
            elapsed_seconds = time.perf_counter() - started
            _log_poll_result(
                parsed_url=parsed_url,
                run_id=run_id,
                database=database,
                metadata=metadata,
                status="failure",
                elapsed_seconds=elapsed_seconds,
                poll_count=poll_count,
                operating_date=business_date,
                error_type=type(exc).__name__,
                error_message=str(exc),
            )
            raise

        elapsed_seconds = time.perf_counter() - started
        shape = _market_day_shape(df, business_date)
        _log_poll_result(
            parsed_url=parsed_url,
            run_id=run_id,
            database=database,
            metadata={
                **(metadata or {}),
                "expected_period_count": shape["expected_period_count"],
                "period_count": shape["period_count"],
                "entity_count": shape["entity_count"],
                "expected_row_count": shape["expected_row_count"],
            },
            status="success",
            elapsed_seconds=elapsed_seconds,
            poll_count=poll_count,
            operating_date=business_date,
            rows_returned=len(df),
        )
        return df


def _fetch_complete_market_day(
    *,
    operating_date: date | datetime,
    run_id: str | None,
    database: str | None,
    metadata: dict[str, Any] | None,
) -> pd.DataFrame:
    business_date = _business_date(operating_date)
    try:
        df = scrape._pull(
            start_date=pd.Timestamp(business_date).to_pydatetime(),
            run_id=run_id,
            database=database,
            metadata=metadata,
        )
    except RuntimeError as exc:
        raise DataNotYetAvailable(str(exc)) from exc

    shape = _market_day_shape(df, business_date)
    if not shape["is_complete"]:
        raise DataNotYetAvailable(
            "ISO-NE DA LMP rows are not complete for "
            f"{business_date.isoformat()} "
            f"(rows={shape['row_count']}, locations={shape['actual_entities']}, "
            f"periods={shape['period_count']}, "
            f"expected_periods={shape['expected_period_count']}, "
            f"duplicate_keys={shape['duplicate_entity_period_rows']}, "
            f"null_lmp_rows={shape['null_lmp_rows']})"
        )
    return df


def _notify_da_email_release_events(
    *,
    events: list[dict[str, Any]],
    run_mode: str,
    database: str | None,
    run_logger: Any,
) -> int:
    if run_mode != "scheduled":
        run_logger.info("Skipping NEPOOL DA release emails outside scheduled mode.")
        return 0
    if not events:
        return 0

    queued = 0
    try:
        for event in events:
            enqueued_rows = email_notifications.enqueue_da_lmp_release_notifications(
                iso="isone",
                event=event,
                database=database,
            )
            queued += sum(1 for row in enqueued_rows if row.get("created"))

        if not email_notifications.notifications_enabled():
            run_logger.info(
                "NEPOOL DA release email notifications "
                f"queued={queued}; sending is disabled."
            )
            return queued

        processed = email_notifications.send_due_email_notifications(
            limit=20,
            database=database,
        )
        run_logger.info(
            "NEPOOL DA release email notifications "
            f"queued={queued}, processed={len(processed)}."
        )
    except Exception:
        run_logger.exception(
            "NEPOOL DA release email notification handling failed; "
            "scrape data and readiness events remain committed."
        )

    return queued


def _emit_data_availability_events(
    df: pd.DataFrame,
    run_id: str | None,
    database: str | None = TARGET_DATABASE,
) -> list[dict[str, Any]]:
    """Emit one readiness event per complete ISO-NE DA LMP business date."""
    if df.empty:
        logger.info("No ISO-NE DA LMP rows available for readiness emission")
        return []

    required_columns = {
        "date",
        "hour_ending",
        "location_id",
        "location_name",
        "location_type",
    }
    missing_columns = required_columns - set(df.columns)
    if missing_columns:
        raise ValueError(
            "Cannot assess ISO-NE DA LMP data readiness; missing columns: "
            f"{sorted(missing_columns)}"
        )

    current_df = df.copy()
    current_df["date"] = pd.to_datetime(current_df["date"]).dt.date
    current_df["hour_ending"] = pd.to_numeric(
        current_df["hour_ending"],
        errors="coerce",
    )
    current_df = current_df.dropna(subset=["date", "hour_ending", "location_id"])
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
    shape = _market_day_shape(date_df, business_date)
    if not shape["is_complete"]:
        logger.warning(
            "Skipping ISO-NE DA LMP readiness event for %s; incomplete rows "
            "(rows=%s, entities=%s, periods=%s, expected_periods=%s, "
            "min_periods_per_entity=%s, max_periods_per_entity=%s, duplicates=%s, "
            "null_lmp_rows=%s)",
            business_date,
            shape["row_count"],
            shape["entity_count"],
            shape["period_count"],
            shape["expected_period_count"],
            shape["min_periods_per_entity"],
            shape["max_periods_per_entity"],
            shape["duplicate_entity_period_rows"],
            shape["null_lmp_rows"],
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
        "expected_period_count": shape["expected_period_count"],
        "expected_row_count": shape["expected_row_count"],
        "min_periods_per_entity": shape["min_periods_per_entity"],
        "max_periods_per_entity": shape["max_periods_per_entity"],
        "duplicate_entity_period_rows": shape["duplicate_entity_period_rows"],
        "null_lmp_rows": shape["null_lmp_rows"],
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
        row_count=shape["row_count"],
        entity_count=shape["entity_count"],
        period_count=shape["period_count"],
        completeness_status="complete",
        run_id=run_id,
        payload=payload,
        database=database,
    )


def _market_day_shape(
    df: pd.DataFrame,
    business_date: date | datetime,
) -> dict[str, Any]:
    business_date = _business_date(business_date)
    expected_period_count = _expected_period_count_for_date(business_date)
    expected_row_count = expected_period_count

    if df.empty:
        return {
            "is_complete": False,
            "row_count": 0,
            "actual_entities": [],
            "entity_count": 0,
            "period_count": 0,
            "expected_period_count": expected_period_count,
            "expected_row_count": expected_row_count,
            "min_periods_per_entity": 0,
            "max_periods_per_entity": 0,
            "duplicate_entity_period_rows": 0,
            "null_lmp_rows": 0,
        }

    required_columns = {
        "date",
        "hour_ending",
        "location_id",
        "location_name",
        "location_type",
        "locational_marginal_price",
    }
    missing_columns = required_columns - set(df.columns)
    if missing_columns:
        raise ValueError(
            "Cannot assess ISO-NE DA LMP data readiness; missing columns: "
            f"{sorted(missing_columns)}"
        )

    current_df = df.copy()
    current_df["date"] = pd.to_datetime(
        current_df["date"],
        errors="coerce",
    ).dt.date
    current_df["hour_ending"] = pd.to_numeric(
        current_df["hour_ending"],
        errors="coerce",
    )
    current_df["location_id"] = pd.to_numeric(
        current_df["location_id"],
        errors="coerce",
    )
    current_df["locational_marginal_price"] = pd.to_numeric(
        current_df["locational_marginal_price"],
        errors="coerce",
    )
    date_df = current_df.loc[
        (current_df["date"] == business_date)
        & (current_df["location_id"] == scrape.INTERNAL_HUB_LOCATION_ID)
    ].copy()

    actual_entity_set = set(date_df["location_id"].dropna().astype(int).unique())
    entity_count = int(date_df["location_id"].nunique())
    period_count = int(date_df["hour_ending"].nunique())
    periods_per_entity = date_df.groupby("location_id")["hour_ending"].nunique()
    min_periods_per_entity = int(periods_per_entity.min()) if entity_count else 0
    max_periods_per_entity = int(periods_per_entity.max()) if entity_count else 0
    duplicate_entity_period_rows = int(
        date_df.duplicated(["location_id", "hour_ending"]).sum()
    )
    null_lmp_rows = int(date_df["locational_marginal_price"].isna().sum())
    row_count = int(len(date_df))

    return {
        "is_complete": (
            actual_entity_set == {scrape.INTERNAL_HUB_LOCATION_ID}
            and period_count == expected_period_count
            and min_periods_per_entity == expected_period_count
            and max_periods_per_entity == expected_period_count
            and row_count == expected_row_count
            and duplicate_entity_period_rows == 0
            and null_lmp_rows == 0
        ),
        "row_count": row_count,
        "actual_entities": sorted(actual_entity_set),
        "entity_count": entity_count,
        "period_count": period_count,
        "expected_period_count": expected_period_count,
        "expected_row_count": expected_row_count,
        "min_periods_per_entity": min_periods_per_entity,
        "max_periods_per_entity": max_periods_per_entity,
        "duplicate_entity_period_rows": duplicate_entity_period_rows,
        "null_lmp_rows": null_lmp_rows,
    }


def _log_poll_result(
    *,
    parsed_url,
    run_id: str | None,
    database: str | None,
    metadata: dict[str, Any] | None,
    status: str,
    elapsed_seconds: float,
    poll_count: int,
    operating_date: date | datetime,
    rows_returned: int | None = None,
    error_type: str | None = None,
    error_message: str | None = None,
) -> None:
    log_api_fetch(
        actor_type="scrape",
        provider="isone",
        pipeline_name=API_SCRAPE_NAME,
        run_id=run_id,
        operation_name=f"{API_SCRAPE_NAME}_poll",
        feed_name=API_SCRAPE_NAME,
        target_table=TARGET_TABLE_FQN,
        method="GET",
        target_host=parsed_url.netloc,
        target_path=parsed_url.path,
        status=status,
        http_status=200 if status == "success" else None,
        elapsed_ms=round(elapsed_seconds * 1000),
        attempt=poll_count,
        rows_returned=rows_returned,
        error_type=error_type,
        error_message=redact_secrets(error_message),
        metadata={
            **(metadata or {}),
            "target_operating_date": _business_date(operating_date).isoformat(),
            "poll_count": poll_count,
            "poll_seconds": round(elapsed_seconds, 1),
        },
        database=database,
    )


def _data_availability_event_key(business_date: date) -> str:
    return (
        f"{DATASET_NAME}:{DATA_AVAILABILITY_TYPE}:"
        f"{business_date.isoformat()}:{DATA_SCOPE}"
    )


def _business_date(value: date | datetime) -> date:
    return pd.Timestamp(value).date()


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
