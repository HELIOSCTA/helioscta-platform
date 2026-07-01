"""Orchestrate PJM verified five-minute Real-Time HRL LMPs."""

from __future__ import annotations

import logging
from collections.abc import Iterable
from datetime import date, datetime, timezone
from pathlib import Path
import sys
from typing import Any
from uuid import uuid4

import pandas as pd
from dateutil.relativedelta import relativedelta

REPO_ROOT = Path(__file__).resolve().parents[4]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from backend import credentials
from backend.scrapes.power.pjm import rt_fivemin_hrl_lmps as scrape
from backend.scrapes.power.pjm.pricing_filters import (
    DEFAULT_PRICING_NODE_TYPES,
    pricing_node_type_label,
)
from backend.utils import script_logging, slack_notifications
from backend.utils.data_availability import emit_data_availability_event
from backend.utils.ops_logging import redact_secrets

API_SCRAPE_NAME = scrape.API_SCRAPE_NAME
TARGET_DATABASE: str | None = None
TARGET_SCHEMA = scrape.TARGET_SCHEMA
TARGET_TABLE = scrape.TARGET_TABLE
TARGET_TABLE_FQN = scrape.TARGET_TABLE_FQN
DATASET_NAME = "pjm_rt_fivemin_hrl_lmps"
DATA_SOURCE_SYSTEM = "pjm"
DATA_AVAILABILITY_TYPE = "data_ready"
DATA_SCOPE = "hub_zone_interface"
DATA_GRAIN = "date_5min_pnode"
LOCAL_MARKET_TIMEZONE = "America/New_York"
DEFAULT_LOOKBACK_DAYS = 2
DEFAULT_LOOKAHEAD_DAYS = 0
DEFAULT_DELTA = relativedelta(days=1)
PERIOD_LENGTH = pd.Timedelta(minutes=5)

logger = logging.getLogger(__name__)


def main(
    start_date: datetime | None = None,
    end_date: datetime | None = None,
    delta: relativedelta = DEFAULT_DELTA,
    pnode_types: str | Iterable[str] | None = DEFAULT_PRICING_NODE_TYPES,
    pnode_id_batch_size: int = scrape.DEFAULT_PNODE_ID_BATCH_SIZE,
    database: str | None = None,
    run_mode: str = "scheduled",
    metadata: dict[str, Any] | None = None,
) -> pd.DataFrame | None:
    """Run the verified five-minute RT LMP workflow and emit readiness events."""
    now = datetime.now()
    start_date = start_date or (now - relativedelta(days=DEFAULT_LOOKBACK_DAYS))
    end_date = end_date or (now + relativedelta(days=DEFAULT_LOOKAHEAD_DAYS))
    database = database or credentials.AZURE_POSTGRESQL_DB_NAME
    node_scope = pricing_node_type_label(pnode_types)
    run_logger = script_logging.init_logging(
        name=API_SCRAPE_NAME,
        log_dir=script_logging.get_log_dir(Path(__file__).parent / "logs"),
        log_to_file=True,
        delete_if_no_errors=True,
    )
    run_id = str(uuid4())
    rows_processed = 0
    frames: list[pd.DataFrame] = []

    try:
        run_logger.header(API_SCRAPE_NAME)
        run_logger.info(f"Run ID: {run_id}")
        run_logger.info(f"Run mode: {run_mode}")
        run_logger.info(f"Pricing node scope: {node_scope}")
        fetch_metadata = {"run_mode": run_mode, **(metadata or {})}

        current_date = start_date
        while current_date <= end_date:
            params = {
                "start_date": current_date.strftime("%Y-%m-%d 00:00"),
                "end_date": current_date.strftime("%Y-%m-%d 23:55"),
            }
            run_logger.section(
                f"Pulling {node_scope} data for "
                f"{params['start_date']} to {params['end_date']}..."
            )
            df = scrape._pull(
                start_date=params["start_date"],
                end_date=params["end_date"],
                pnode_types=pnode_types,
                pnode_id_batch_size=pnode_id_batch_size,
                run_id=run_id,
                database=database,
                metadata=fetch_metadata,
            )

            if df.empty:
                run_logger.section(
                    "No data returned for "
                    f"{params['start_date']} to {params['end_date']}, skipping upsert."
                )
            else:
                run_logger.section(f"Upserting {len(df)} rows...")
                scrape._upsert(df, database=database)
                rows_processed += len(df)
                frames.append(df)
                run_logger.success(
                    "Successfully pulled and upserted data for "
                    f"{params['start_date']} to {params['end_date']}."
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
                run_logger.info(
                    f"Data availability event {event['event_key']} {status}."
                )
        else:
            run_logger.info(
                "No complete RT five-minute HRL LMP business date detected; "
                "no data availability event emitted."
            )

        run_logger.section("Handling release Slack notification(s) ...")
        _notify_rt_fivemin_release_events(
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


def _emit_data_availability_events(
    df: pd.DataFrame,
    run_id: str | None,
    database: str | None = TARGET_DATABASE,
) -> list[dict[str, Any]]:
    """Emit one readiness event per complete current five-minute business date."""
    if df.empty:
        logger.info("No RT five-minute HRL LMP rows available for readiness emission")
        return []

    required_columns = {
        "datetime_beginning_utc",
        "datetime_beginning_ept",
        "pnode_id",
        "pnode_name",
        "type",
        "row_is_current",
    }
    missing_columns = required_columns - set(df.columns)
    if missing_columns:
        raise ValueError(
            "Cannot assess RT five-minute HRL LMP data readiness; missing columns: "
            f"{sorted(missing_columns)}"
        )

    current_df = df.loc[_is_current_mask(df)].copy()
    if current_df.empty:
        logger.info(
            "No current RT five-minute HRL LMP rows available for readiness emission"
        )
        return []

    current_df["datetime_beginning_utc"] = pd.to_datetime(
        current_df["datetime_beginning_utc"]
    )
    current_df["datetime_beginning_ept"] = pd.to_datetime(
        current_df["datetime_beginning_ept"]
    )
    current_df["business_date"] = current_df["datetime_beginning_ept"].dt.date

    emitted: list[dict[str, Any]] = []
    for business_date, date_df in sorted(current_df.groupby("business_date")):
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
            "Skipping RT five-minute HRL LMP readiness event for %s; incomplete "
            "current rows (rows=%s, entities=%s, periods=%s, expected_periods=%s, "
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
        date_df["datetime_beginning_utc"].max() + PERIOD_LENGTH
    )
    payload = {
        "business_date": business_date.isoformat(),
        "expected_period_count": expected_period_count,
        "expected_row_count": expected_row_count,
        "min_periods_per_entity": min_periods_per_entity,
        "max_periods_per_entity": max_periods_per_entity,
        "duplicate_entity_period_rows": duplicate_entity_period_rows,
        "type_counts": _value_counts(date_df["type"]),
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


def _expected_period_count_for_date(business_date: date) -> int:
    start = pd.Timestamp(business_date).tz_localize(LOCAL_MARKET_TIMEZONE)
    end = (pd.Timestamp(business_date) + pd.Timedelta(days=1)).tz_localize(
        LOCAL_MARKET_TIMEZONE
    )
    return int((end - start) / PERIOD_LENGTH)


def _utc_timestamp(value: Any) -> datetime:
    timestamp = pd.Timestamp(value)
    if timestamp.tzinfo is None:
        timestamp = timestamp.tz_localize(timezone.utc)
    else:
        timestamp = timestamp.tz_convert(timezone.utc)
    return timestamp.to_pydatetime()


def _value_counts(values: pd.Series) -> dict[str, int]:
    counts = values.astype("string").str.strip().value_counts(dropna=False)
    return {str(key): int(value) for key, value in counts.items()}


def _notify_rt_fivemin_release_events(
    *,
    events: list[dict[str, Any]],
    run_mode: str,
    database: str | None,
    run_logger: Any,
) -> int:
    if run_mode != "scheduled":
        run_logger.info(
            "Skipping RT five-minute HRL LMP Slack notifications outside scheduled mode."
        )
        return 0
    if not events:
        return 0

    queued = 0
    try:
        for event in events:
            message = slack_notifications.build_pjm_rt_fivemin_hrl_lmp_release_slack(
                event=event,
            )
            enqueued = slack_notifications.enqueue_slack_notification(
                database=database,
                **message,
            )
            if enqueued.get("created"):
                queued += 1

        if not slack_notifications.notifications_enabled():
            run_logger.info(
                "RT five-minute HRL LMP Slack notifications "
                f"queued={queued}; sending is disabled."
            )
            return queued

        processed = slack_notifications.send_due_slack_notifications(
            limit=20,
            database=database,
        )
        run_logger.info(
            "RT five-minute HRL LMP Slack notifications "
            f"queued={queued}, processed={len(processed)}."
        )
    except Exception:
        run_logger.exception(
            "RT five-minute HRL LMP Slack notification handling failed; "
            "scrape data and readiness events remain committed."
        )

    return queued


if __name__ == "__main__":
    main()
