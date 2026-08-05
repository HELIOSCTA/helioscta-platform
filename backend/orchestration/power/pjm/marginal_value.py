"""Shared helpers for PJM marginal value orchestration."""

from __future__ import annotations

import logging
from datetime import date, datetime, timezone
from typing import Any

import pandas as pd

from backend.scrapes.power.pjm import client
from backend.scrapes.power.pjm.data_miner_feed import (
    DataMinerFeedConfig,
    normalize_feed_frame,
)
from backend.utils.data_availability import emit_data_availability_event


logger = logging.getLogger(__name__)

LOCAL_MARKET_TIMEZONE = "America/New_York"
DATA_SOURCE_SYSTEM = "pjm"
DATA_AVAILABILITY_TYPE = "data_ready"
DATA_SCOPE = "constraint_contingency"
DATA_GRAIN = "date_interval_constraint_contingency"


def window_for_market_date(target_date: date, config: DataMinerFeedConfig) -> tuple[str, str]:
    return (
        target_date.strftime("%Y-%m-%d 00:00"),
        target_date.strftime(f"%Y-%m-%d {config.default_end_time}"),
    )


def request_params(target_date: date, config: DataMinerFeedConfig) -> dict[str, str]:
    window_start, window_end = window_for_market_date(target_date, config)
    params = dict(config.static_params)
    params[str(config.datetime_filter_field)] = f"{window_start} to {window_end}"
    return params


def fetch_market_day(target_date: date, config: DataMinerFeedConfig) -> pd.DataFrame:
    df = client.fetch_csv(
        config.feed_name,
        params=request_params(target_date, config),
        log_fetch=False,
    )
    if df.empty:
        return df
    return normalize_feed_frame(df, config)


def market_day_shape(
    df: pd.DataFrame,
    target_date: date,
    config: DataMinerFeedConfig,
    *,
    expected_interval_minutes: int,
) -> dict[str, Any]:
    expected_period_count = expected_period_count_for_date(
        target_date,
        interval_minutes=expected_interval_minutes,
    )
    empty_shape = {
        "is_complete": False,
        "row_count": 0,
        "period_count": 0,
        "expected_period_count": expected_period_count,
        "constraint_count": 0,
        "duplicate_key_count": 0,
    }
    if df.empty:
        return empty_shape
    if "datetime_beginning_ept" not in df or "datetime_beginning_utc" not in df:
        return empty_shape

    day_df = df.loc[
        pd.to_datetime(df["datetime_beginning_ept"]).dt.date == target_date
    ].copy()
    if day_df.empty:
        return empty_shape

    duplicate_key_count = int(day_df.duplicated(list(config.primary_key)).sum())
    constraint_count = int(
        day_df[["monitored_facility", "contingency_facility"]]
        .drop_duplicates()
        .shape[0]
    )

    return {
        "is_complete": len(day_df) > 0 and duplicate_key_count == 0,
        "row_count": int(len(day_df)),
        "period_count": int(day_df["datetime_beginning_utc"].nunique()),
        "expected_period_count": expected_period_count,
        "constraint_count": constraint_count,
        "duplicate_key_count": duplicate_key_count,
    }


def expected_period_count_for_date(target_date: date, *, interval_minutes: int) -> int:
    start = pd.Timestamp(target_date).tz_localize(LOCAL_MARKET_TIMEZONE)
    end = (pd.Timestamp(target_date) + pd.Timedelta(days=1)).tz_localize(
        LOCAL_MARKET_TIMEZONE
    )
    return int((end - start) / pd.Timedelta(minutes=interval_minutes))


def emit_marginal_value_availability_event(
    *,
    dataset_name: str,
    source_table: str,
    df: pd.DataFrame,
    target_date: date,
    run_id: str | None,
    database: str | None,
    config: DataMinerFeedConfig,
    expected_interval_minutes: int,
) -> dict[str, Any] | None:
    shape = market_day_shape(
        df,
        target_date,
        config,
        expected_interval_minutes=expected_interval_minutes,
    )
    if not shape["is_complete"]:
        logger.info(
            "Skipping %s readiness event for %s; incomplete shape=%s",
            dataset_name,
            target_date,
            shape,
        )
        return None

    day_df = df.loc[
        pd.to_datetime(df["datetime_beginning_ept"]).dt.date == target_date
    ].copy()
    event_key = data_availability_event_key(dataset_name, target_date)
    window_start = utc_timestamp(day_df["datetime_beginning_utc"].min())
    window_end = utc_timestamp(day_df["datetime_ending_utc"].max())
    payload = {
        "business_date": target_date.isoformat(),
        "expected_period_count": shape["expected_period_count"],
        "period_count": shape["period_count"],
        "constraint_count": shape["constraint_count"],
        "duplicate_key_count": shape["duplicate_key_count"],
        "window_end_convention": "exclusive",
    }

    return emit_data_availability_event(
        event_key=event_key,
        dataset=dataset_name,
        source_system=DATA_SOURCE_SYSTEM,
        availability_type=DATA_AVAILABILITY_TYPE,
        business_date=target_date,
        window_start=window_start,
        window_end=window_end,
        scope=DATA_SCOPE,
        grain=DATA_GRAIN,
        source_table=source_table,
        row_count=shape["row_count"],
        entity_count=shape["constraint_count"],
        period_count=shape["period_count"],
        completeness_status="complete",
        run_id=run_id,
        payload=payload,
        database=database,
        update_existing=True,
    )


def data_availability_event_key(dataset_name: str, business_date: date) -> str:
    return (
        f"{dataset_name}:{DATA_AVAILABILITY_TYPE}:"
        f"{business_date.isoformat()}:{DATA_SCOPE}"
    )


def utc_timestamp(value: Any) -> datetime:
    timestamp = pd.Timestamp(value)
    if timestamp.tzinfo is None:
        timestamp = timestamp.tz_localize(timezone.utc)
    else:
        timestamp = timestamp.tz_convert(timezone.utc)
    return timestamp.to_pydatetime()
