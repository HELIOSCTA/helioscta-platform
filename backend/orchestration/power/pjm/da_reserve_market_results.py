"""Orchestrate PJM day-ahead reserve market results publication polling."""

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
from backend import credentials
from backend.orchestration.power.pjm._policies import (
    DataNotYetAvailable,
    api_poll_policy,
)
from backend.scrapes.power.pjm import client
from backend.scrapes.power.pjm import da_reserve_market_results as scrape
from backend.scrapes.power.pjm.data_miner_feed import (
    normalize_feed_frame,
    upsert_feed_frame,
)
from backend.utils import script_logging, slack_notifications
from backend.utils.data_availability import emit_data_availability_event
from backend.utils.ops_logging import log_api_fetch, redact_secrets


logger = logging.getLogger(__name__)

CONFIG = scrape.CONFIG
API_SCRAPE_NAME = scrape.API_SCRAPE_NAME
TARGET_TABLE = scrape.TARGET_TABLE
TARGET_TABLE_FQN = scrape.TARGET_TABLE_FQN
DATASET_NAME = "pjm_da_reserve_market_results"
DATA_SOURCE_SYSTEM = "pjm"
DATA_AVAILABILITY_TYPE = "data_ready"
DATA_SCOPE = "locale_service"
DATA_GRAIN = "date_hour_locale_service"

LOCAL_MARKET_TIMEZONE = "America/New_York"
EXPECTED_MIN_LOCALE_COUNT = 2
EXPECTED_MIN_SERVICE_COUNT = 3
EXPECTED_MIN_LOCALE_SERVICE_COUNT = 5
POLL_CEILING_SECONDS = 4 * 60 * 60
POLL_WAIT_SECONDS = 2 * 60


def _target_market_date(value: date | datetime | str | None = None) -> date:
    if value is None:
        return datetime.now(ZoneInfo(LOCAL_MARKET_TIMEZONE)).date()
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    return date.fromisoformat(value)


def _window_for_market_date(target_date: date) -> tuple[str, str]:
    return (
        target_date.strftime("%Y-%m-%d 00:00"),
        target_date.strftime("%Y-%m-%d 23:00"),
    )


def _request_params(target_date: date) -> dict[str, str]:
    window_start, window_end = _window_for_market_date(target_date)
    params = dict(CONFIG.static_params)
    params[str(CONFIG.datetime_filter_field)] = f"{window_start} to {window_end}"
    return params


def _fetch_market_day(target_date: date) -> pd.DataFrame:
    df = client.fetch_csv(
        CONFIG.feed_name,
        params=_request_params(target_date),
        log_fetch=False,
    )
    if df.empty:
        return df
    return normalize_feed_frame(df, CONFIG)


@api_poll_policy(max_seconds=POLL_CEILING_SECONDS, wait_seconds=POLL_WAIT_SECONDS)
def _wait_for_complete_data(target_date: date) -> pd.DataFrame:
    df = _fetch_market_day(target_date)
    shape = _market_day_shape(df, target_date)
    if not shape["is_complete"]:
        raise DataNotYetAvailable(
            "PJM da_reserve_market_results is not complete for "
            f"{target_date.isoformat()} "
            f"(rows={shape['row_count']}, locales={shape['locale_count']}, "
            f"services={shape['service_count']}, "
            f"locale_services={shape['locale_service_count']}, "
            f"periods={shape['period_count']}, "
            f"expected_periods={shape['expected_period_count']}, "
            f"duplicate_keys={shape['duplicate_key_count']})"
        )
    return df


def _wait_for_complete_data_logged(
    *,
    target_date: date,
    run_id: str | None,
    database: str | None,
    metadata: dict[str, Any] | None = None,
) -> pd.DataFrame:
    parsed_url = urlsplit(f"{client.BASE_URL}{CONFIG.feed_name}")
    started = time.perf_counter()

    try:
        df = _wait_for_complete_data(target_date)
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
            "locale_count": shape["locale_count"],
            "service_count": shape["service_count"],
            "locale_service_count": shape["locale_service_count"],
        },
        database=database,
    )
    return df


def _poll_count() -> int:
    stats = getattr(_wait_for_complete_data, "statistics", {}) or {}
    return int(stats.get("attempt_number", 1))


def _market_day_shape(df: pd.DataFrame, target_date: date) -> dict[str, Any]:
    expected_period_count = _expected_period_count_for_date(target_date)
    empty_shape = {
        "is_complete": False,
        "row_count": 0,
        "locale_count": 0,
        "service_count": 0,
        "locale_service_count": 0,
        "period_count": 0,
        "expected_period_count": expected_period_count,
        "min_periods_per_locale_service": 0,
        "max_periods_per_locale_service": 0,
        "duplicate_key_count": 0,
    }
    if df.empty:
        return empty_shape

    day_df = df.loc[
        pd.to_datetime(df["datetime_beginning_ept"]).dt.date == target_date
    ].copy()
    if day_df.empty:
        return empty_shape

    duplicate_key_count = int(day_df.duplicated(list(CONFIG.primary_key)).sum())
    locale_count = int(day_df["locale"].nunique())
    service_count = int(day_df["service"].nunique())
    locale_service_counts = day_df.groupby(["locale", "service"])[
        "datetime_beginning_utc"
    ].nunique()
    locale_service_count = int(len(locale_service_counts))
    min_periods_per_locale_service = (
        int(locale_service_counts.min()) if locale_service_count else 0
    )
    max_periods_per_locale_service = (
        int(locale_service_counts.max()) if locale_service_count else 0
    )
    period_count = int(day_df["datetime_beginning_utc"].nunique())
    expected_row_count = locale_service_count * expected_period_count
    row_count = int(len(day_df))

    is_complete = (
        row_count > 0
        and locale_count >= EXPECTED_MIN_LOCALE_COUNT
        and service_count >= EXPECTED_MIN_SERVICE_COUNT
        and locale_service_count >= EXPECTED_MIN_LOCALE_SERVICE_COUNT
        and period_count == expected_period_count
        and min_periods_per_locale_service == expected_period_count
        and max_periods_per_locale_service == expected_period_count
        and row_count == expected_row_count
        and duplicate_key_count == 0
    )
    return {
        "is_complete": is_complete,
        "row_count": row_count,
        "locale_count": locale_count,
        "service_count": service_count,
        "locale_service_count": locale_service_count,
        "period_count": period_count,
        "expected_period_count": expected_period_count,
        "min_periods_per_locale_service": min_periods_per_locale_service,
        "max_periods_per_locale_service": max_periods_per_locale_service,
        "duplicate_key_count": duplicate_key_count,
    }


def _expected_period_count_for_date(target_date: date) -> int:
    start = pd.Timestamp(target_date).tz_localize(LOCAL_MARKET_TIMEZONE)
    end = (pd.Timestamp(target_date) + pd.Timedelta(days=1)).tz_localize(
        LOCAL_MARKET_TIMEZONE
    )
    return int((end - start) / pd.Timedelta(hours=1))


def _emit_data_availability_events(
    *,
    df: pd.DataFrame,
    target_date: date,
    run_id: str | None,
    database: str | None,
) -> list[dict[str, Any]]:
    if df.empty:
        logger.info("No DA reserve market results available for readiness emission")
        return []

    required_columns = {
        "datetime_beginning_utc",
        "datetime_beginning_ept",
        "locale",
        "service",
    }
    missing_columns = required_columns - set(df.columns)
    if missing_columns:
        raise ValueError(
            "Cannot assess DA reserve market results readiness; missing columns: "
            f"{sorted(missing_columns)}"
        )

    current_df = df.copy()
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
            "No DA reserve market results available for target market date %s",
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
    shape = _market_day_shape(date_df, business_date)
    if not shape["is_complete"]:
        logger.warning(
            "Skipping DA reserve market results readiness event for %s; "
            "incomplete rows (rows=%s, locales=%s, services=%s, "
            "locale_services=%s, periods=%s, expected_periods=%s, "
            "min_periods_per_locale_service=%s, "
            "max_periods_per_locale_service=%s, duplicates=%s)",
            business_date,
            shape["row_count"],
            shape["locale_count"],
            shape["service_count"],
            shape["locale_service_count"],
            shape["period_count"],
            shape["expected_period_count"],
            shape["min_periods_per_locale_service"],
            shape["max_periods_per_locale_service"],
            shape["duplicate_key_count"],
        )
        return None

    event_key = _data_availability_event_key(business_date)
    window_start = _utc_timestamp(date_df["datetime_beginning_utc"].min())
    window_end = _utc_timestamp(
        date_df["datetime_beginning_utc"].max() + pd.Timedelta(hours=1)
    )
    payload = {
        "business_date": business_date.isoformat(),
        "expected_period_count": shape["expected_period_count"],
        "expected_row_count": (
            shape["locale_service_count"] * shape["expected_period_count"]
        ),
        "min_locale_count": EXPECTED_MIN_LOCALE_COUNT,
        "min_service_count": EXPECTED_MIN_SERVICE_COUNT,
        "min_locale_service_count": EXPECTED_MIN_LOCALE_SERVICE_COUNT,
        "locale_count": shape["locale_count"],
        "service_count": shape["service_count"],
        "locale_service_count": shape["locale_service_count"],
        "min_periods_per_locale_service": shape["min_periods_per_locale_service"],
        "max_periods_per_locale_service": shape["max_periods_per_locale_service"],
        "duplicate_key_count": shape["duplicate_key_count"],
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
        entity_count=shape["locale_service_count"],
        period_count=shape["period_count"],
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


def _utc_timestamp(value: Any) -> datetime:
    timestamp = pd.Timestamp(value)
    if timestamp.tzinfo is None:
        timestamp = timestamp.tz_localize(timezone.utc)
    else:
        timestamp = timestamp.tz_convert(timezone.utc)
    return timestamp.to_pydatetime()


def _notify_da_reserve_release_events(
    *,
    events: list[dict[str, Any]],
    run_mode: str,
    database: str | None,
    run_logger: Any,
) -> int:
    if run_mode != "scheduled":
        run_logger.info(
            "Skipping DA reserve market results Slack notifications outside "
            "scheduled mode."
        )
        return 0
    if not events:
        return 0

    queued = 0
    try:
        for event in events:
            message = (
                slack_notifications.build_pjm_da_reserve_market_results_release_slack(
                    event=event,
                )
            )
            enqueued = slack_notifications.enqueue_slack_notification(
                database=database,
                **message,
            )
            if enqueued.get("created"):
                queued += 1

        if not slack_notifications.notifications_enabled():
            run_logger.info(
                "DA reserve market results Slack notifications "
                f"queued={queued}; sending is disabled."
            )
            return queued

        processed = slack_notifications.send_due_slack_notifications(
            limit=20,
            database=database,
        )
        run_logger.info(
            "DA reserve market results Slack notifications "
            f"queued={queued}, processed={len(processed)}."
        )
    except Exception:
        run_logger.exception(
            "DA reserve market results Slack notification handling failed; "
            "scrape data and readiness events remain committed."
        )

    return queued


def main(
    *,
    target_date: date | datetime | str | None = None,
    database: str | None = None,
    run_mode: str = "scheduled",
    metadata: dict[str, Any] | None = None,
) -> pd.DataFrame:
    """Poll and upsert the current PJM DA reserve market results publication."""
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

        run_logger.section("Waiting for complete DA reserve market results ...")
        df = _wait_for_complete_data_logged(
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
        if events:
            for event in events:
                status = "created" if event.get("created") else "already existed"
                run_logger.info(
                    f"Data availability event {event['event_key']} {status}."
                )
        else:
            run_logger.info(
                "No complete DA reserve market results business date detected; "
                "no data availability event emitted."
            )

        run_logger.section("Handling release Slack notification(s) ...")
        _notify_da_reserve_release_events(
            events=events,
            run_mode=run_mode,
            database=database,
            run_logger=run_logger,
        )

        run_logger.success(
            f"{API_SCRAPE_NAME} completed; {len(df)} rows processed."
        )
        return df

    except Exception as exc:
        run_logger.exception(f"Pipeline failed: {redact_secrets(str(exc))}")
        raise

    finally:
        script_logging.close_logging()


if __name__ == "__main__":
    main()
