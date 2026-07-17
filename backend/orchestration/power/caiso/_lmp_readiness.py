"""Readiness helpers for CAISO LMP workflows."""
from __future__ import annotations

from datetime import date, datetime, timezone, timedelta
import logging
from typing import Any

import pandas as pd

from backend.scrapes.power.caiso import _lmp
from backend.utils.data_availability import emit_data_availability_event


DATA_AVAILABILITY_TYPE = "data_ready"
LOCAL_MARKET_TIMEZONE = _lmp.LOCAL_MARKET_TIMEZONE

logger = logging.getLogger(__name__)


def emit_lmp_data_availability_events(
    *,
    df: pd.DataFrame,
    run_id: str | None,
    dataset_name: str,
    source_table: str,
    scope: str,
    grain: str,
    interval_minutes: int,
    expected_nodes: list[str] | tuple[str, ...],
    database: str | None = None,
) -> list[dict[str, Any]]:
    """Emit one readiness event per complete CAISO LMP trading date."""
    if df.empty:
        logger.info("No CAISO LMP rows available for readiness emission")
        return []

    required_columns = {
        "operating_date",
        "interval_start_time_utc",
        "node_id",
    }
    missing_columns = required_columns - set(df.columns)
    if missing_columns:
        raise ValueError(
            "Cannot assess CAISO LMP data readiness; missing columns: "
            f"{sorted(missing_columns)}"
        )

    current_df = df.copy()
    current_df["operating_date"] = pd.to_datetime(
        current_df["operating_date"],
    ).dt.date
    current_df["interval_start_time_utc"] = pd.to_datetime(
        current_df["interval_start_time_utc"],
        utc=True,
        errors="coerce",
    )
    current_df["node_id"] = current_df["node_id"].astype(str).str.strip()
    current_df = current_df.dropna(
        subset=["operating_date", "interval_start_time_utc", "node_id"]
    )

    emitted: list[dict[str, Any]] = []
    for business_date, date_df in sorted(current_df.groupby("operating_date")):
        event = emit_lmp_data_availability_event_for_date(
            business_date=business_date,
            date_df=date_df,
            run_id=run_id,
            dataset_name=dataset_name,
            source_table=source_table,
            scope=scope,
            grain=grain,
            interval_minutes=interval_minutes,
            expected_nodes=expected_nodes,
            database=database,
        )
        if event:
            emitted.append(event)

    return emitted


def emit_lmp_data_availability_event_for_date(
    *,
    business_date: date,
    date_df: pd.DataFrame,
    run_id: str | None,
    dataset_name: str,
    source_table: str,
    scope: str,
    grain: str,
    interval_minutes: int,
    expected_nodes: list[str] | tuple[str, ...],
    database: str | None,
) -> dict[str, Any] | None:
    expected_node_set = set(expected_nodes)
    actual_node_set = set(date_df["node_id"].astype(str).str.strip().unique())
    expected_period_count = expected_period_count_for_date(
        business_date,
        interval_minutes=interval_minutes,
    )
    row_count = int(len(date_df))
    entity_count = int(date_df["node_id"].nunique())
    period_count = int(date_df["interval_start_time_utc"].nunique())
    periods_per_entity = date_df.groupby("node_id")[
        "interval_start_time_utc"
    ].nunique()
    min_periods_per_entity = int(periods_per_entity.min()) if entity_count else 0
    max_periods_per_entity = int(periods_per_entity.max()) if entity_count else 0
    duplicate_entity_period_rows = int(
        date_df.duplicated(["node_id", "interval_start_time_utc"]).sum()
    )
    expected_row_count = len(expected_node_set) * expected_period_count

    is_complete = (
        actual_node_set == expected_node_set
        and period_count == expected_period_count
        and min_periods_per_entity == expected_period_count
        and max_periods_per_entity == expected_period_count
        and row_count == expected_row_count
        and duplicate_entity_period_rows == 0
    )
    if not is_complete:
        logger.warning(
            "Skipping CAISO LMP readiness event for %s; incomplete rows "
            "(rows=%s, entities=%s, periods=%s, expected_periods=%s, "
            "expected_nodes=%s, actual_nodes=%s, min_periods_per_entity=%s, "
            "max_periods_per_entity=%s, duplicates=%s)",
            business_date,
            row_count,
            entity_count,
            period_count,
            expected_period_count,
            sorted(expected_node_set),
            sorted(actual_node_set),
            min_periods_per_entity,
            max_periods_per_entity,
            duplicate_entity_period_rows,
        )
        return None

    event_key = data_availability_event_key(
        dataset_name=dataset_name,
        business_date=business_date,
        scope=scope,
    )
    window_start = utc_timestamp(
        pd.Timestamp(business_date).tz_localize(LOCAL_MARKET_TIMEZONE)
    )
    window_end = utc_timestamp(
        pd.Timestamp(business_date + timedelta(days=1)).tz_localize(
            LOCAL_MARKET_TIMEZONE
        )
    )
    payload = {
        "business_date": business_date.isoformat(),
        "interval_minutes": interval_minutes,
        "expected_nodes": sorted(expected_node_set),
        "actual_nodes": sorted(actual_node_set),
        "expected_period_count": expected_period_count,
        "expected_row_count": expected_row_count,
        "min_periods_per_entity": min_periods_per_entity,
        "max_periods_per_entity": max_periods_per_entity,
        "duplicate_entity_period_rows": duplicate_entity_period_rows,
        "window_end_convention": "exclusive",
    }

    return emit_data_availability_event(
        event_key=event_key,
        dataset=dataset_name,
        source_system="caiso",
        availability_type=DATA_AVAILABILITY_TYPE,
        business_date=business_date,
        window_start=window_start,
        window_end=window_end,
        scope=scope,
        grain=grain,
        source_table=source_table,
        row_count=row_count,
        entity_count=entity_count,
        period_count=period_count,
        completeness_status="complete",
        run_id=run_id,
        payload=payload,
        database=database,
    )


def data_availability_event_key(
    *,
    dataset_name: str,
    business_date: date,
    scope: str,
) -> str:
    return (
        f"{dataset_name}:{DATA_AVAILABILITY_TYPE}:"
        f"{business_date.isoformat()}:{scope}"
    )


def expected_period_count_for_date(
    business_date: date,
    *,
    interval_minutes: int,
) -> int:
    start = pd.Timestamp(business_date).tz_localize(LOCAL_MARKET_TIMEZONE)
    end = pd.Timestamp(business_date + timedelta(days=1)).tz_localize(
        LOCAL_MARKET_TIMEZONE
    )
    return int((end - start) / pd.Timedelta(minutes=interval_minutes))


def utc_timestamp(value: Any) -> datetime:
    timestamp = pd.Timestamp(value)
    if timestamp.tzinfo is None:
        timestamp = timestamp.tz_localize(timezone.utc)
    else:
        timestamp = timestamp.tz_convert(timezone.utc)
    return timestamp.to_pydatetime()
