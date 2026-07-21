"""Orchestrate WSI daily weighted forecast refreshes."""

from __future__ import annotations

import logging
from collections.abc import Iterable
from datetime import datetime, time, timedelta, timezone
from typing import Any

import pandas as pd

from backend.scrapes.weather.wsi import daily_weighted_degree_day_forecast
from backend.scrapes.weather.wsi import daily_weighted_temperature_forecast
from backend.utils.data_availability import emit_data_availability_event

DATA_SOURCE_SYSTEM = "wsi"
DATA_AVAILABILITY_TYPE = "freshness_forecast"
DATA_GRAIN = "entity_forecast_date_metric"
DEFAULT_EXPECTED_FORECAST_DAYS = 15

logger = logging.getLogger(__name__)


def main(
    *,
    database: str | None = None,
    run_mode: str = "scheduled",
    metadata: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Run both WSI daily weighted forecast scrapes and emit freshness events."""
    temperature_df = daily_weighted_temperature_forecast.main(
        database=database,
        run_mode=run_mode,
        metadata=metadata,
    )
    events: dict[str, dict[str, Any]] = {}
    if temperature_df is not None:
        events["temperature"] = _emit_freshness_event(
            df=temperature_df,
            dataset=daily_weighted_temperature_forecast.API_SCRAPE_NAME,
            source_table=daily_weighted_temperature_forecast.TARGET_TABLE_FQN,
            expected_entities=daily_weighted_temperature_forecast.DEFAULT_ENTITY_IDS,
            expected_metric_names=(
                daily_weighted_temperature_forecast.EXPECTED_METRIC_NAMES
            ),
            scope=daily_weighted_temperature_forecast.DEFAULT_REQUEST_REGION,
            database=database,
        )
    else:
        logger.info("No WSI daily weighted temperature rows available for freshness")

    degree_day_df = daily_weighted_degree_day_forecast.main(
        database=database,
        run_mode=run_mode,
        metadata=metadata,
    )
    if degree_day_df is not None:
        events["degree_day"] = _emit_freshness_event(
            df=degree_day_df,
            dataset=daily_weighted_degree_day_forecast.API_SCRAPE_NAME,
            source_table=daily_weighted_degree_day_forecast.TARGET_TABLE_FQN,
            expected_entities=daily_weighted_degree_day_forecast.DEFAULT_STATIONS,
            expected_metric_names=(
                daily_weighted_degree_day_forecast.EXPECTED_METRIC_NAMES
            ),
            scope=daily_weighted_degree_day_forecast.DEFAULT_REQUEST_REGION,
            database=database,
        )
    else:
        logger.info("No WSI daily weighted degree-day rows available for freshness")

    for event in events.values():
        status = "created" if event.get("created") else "already existed"
        logger.info("Data availability event %s %s.", event["event_key"], status)

    return {
        "temperature": temperature_df,
        "degree_day": degree_day_df,
        "events": events,
    }


def _emit_freshness_event(
    *,
    df: pd.DataFrame,
    dataset: str,
    source_table: str,
    expected_entities: Iterable[str],
    expected_metric_names: Iterable[str],
    scope: str,
    database: str | None,
    expected_forecast_days: int = DEFAULT_EXPECTED_FORECAST_DAYS,
) -> dict[str, Any]:
    current_df = _prepare_availability_frame(df)
    current_df["forecast_date"] = pd.to_datetime(
        current_df["forecast_date"],
        errors="coerce",
    ).dt.date
    current_df["source_issue_at_utc"] = pd.to_datetime(
        current_df["source_issue_at_utc"],
        errors="coerce",
        utc=True,
    )
    current_df["scrape_run_at_utc"] = pd.to_datetime(
        current_df["scrape_run_at_utc"],
        errors="coerce",
        utc=True,
    )
    if current_df.empty:
        latest_issue_key, source_issue_at = _source_context_from_attrs(current_df)
        issue_df = current_df
    else:
        latest_issue_key = _latest_issue_key(current_df)
        issue_df = current_df[current_df["source_issue_key"] == latest_issue_key].copy()
        if issue_df.empty:
            raise ValueError("Cannot emit WSI daily weighted freshness; no latest issue")

        source_issue_at = issue_df["source_issue_at_utc"].dropna().max()
        if pd.isna(source_issue_at):
            source_issue_at = issue_df["scrape_run_at_utc"].dropna().max()
        if pd.isna(source_issue_at):
            raise ValueError(
                "Cannot emit WSI daily weighted freshness; issue time is empty"
            )

    coverage = _coverage_payload(
        issue_df=issue_df,
        expected_entities=expected_entities,
        expected_metric_names=expected_metric_names,
        expected_forecast_days=expected_forecast_days,
    )
    completeness_status = "complete" if coverage["is_complete"] else "partial"
    forecast_dates = sorted(
        forecast_date for forecast_date in issue_df["forecast_date"].dropna().unique()
    )
    window_start = _date_to_utc_datetime(forecast_dates[0]) if forecast_dates else None
    window_end = _date_to_utc_datetime(forecast_dates[-1]) if forecast_dates else None
    payload = {
        "scope": scope,
        "latest_source_issue_key": latest_issue_key,
        "latest_source_issue_at_utc": pd.Timestamp(source_issue_at).isoformat(),
        "completeness_basis": (
            "expected_entities_metrics_and_forecast_day_count_for_latest_issue"
        ),
        **coverage,
    }
    payload.pop("is_complete", None)
    event_key = (
        f"{dataset}:{DATA_AVAILABILITY_TYPE}:{scope}:"
        f"{latest_issue_key}"
    )
    return emit_data_availability_event(
        event_key=event_key,
        dataset=dataset,
        source_system=DATA_SOURCE_SYSTEM,
        availability_type=DATA_AVAILABILITY_TYPE,
        business_date=pd.Timestamp(source_issue_at).date(),
        window_start=window_start,
        window_end=window_end,
        scope=scope,
        grain=DATA_GRAIN,
        source_table=source_table,
        row_count=int(len(issue_df)),
        entity_count=int(issue_df["entity_id"].nunique()),
        period_count=int(issue_df["forecast_date"].nunique()),
        completeness_status=completeness_status,
        run_id=None,
        payload=payload,
        database=database,
        update_existing=True,
    )


def _latest_issue_key(df: pd.DataFrame) -> str:
    issue_order = (
        df.assign(
            issue_sort_at=df["source_issue_at_utc"].where(
                df["source_issue_at_utc"].notna(),
                df["scrape_run_at_utc"],
            )
        )
        .groupby("source_issue_key", dropna=False)["issue_sort_at"]
        .max()
        .sort_values()
    )
    if issue_order.empty:
        raise ValueError("No source_issue_key values available")
    return str(issue_order.index[-1])


def _prepare_availability_frame(df: pd.DataFrame) -> pd.DataFrame:
    current_df = df.copy()
    required_columns = [
        "source_issue_key",
        "source_issue_at_utc",
        "scrape_run_at_utc",
        "forecast_date",
        "entity_id",
        "metric_name",
    ]
    for column in required_columns:
        if column not in current_df.columns:
            current_df[column] = pd.Series(dtype="object")
    current_df.attrs.update(df.attrs)
    return current_df


def _source_context_from_attrs(df: pd.DataFrame) -> tuple[str, pd.Timestamp]:
    source_issue_key = df.attrs.get("source_issue_key")
    if not source_issue_key:
        raise ValueError(
            "Cannot emit WSI daily weighted freshness; empty result has no "
            "source_issue_key context"
        )

    source_issue_at = pd.to_datetime(
        df.attrs.get("source_issue_at_utc"),
        errors="coerce",
        utc=True,
    )
    if pd.isna(source_issue_at):
        source_issue_at = pd.to_datetime(
            df.attrs.get("scrape_run_at_utc"),
            errors="coerce",
            utc=True,
        )
    if pd.isna(source_issue_at):
        raise ValueError(
            "Cannot emit WSI daily weighted freshness; empty result has no "
            "issue or scrape timestamp context"
        )
    return str(source_issue_key), pd.Timestamp(source_issue_at)


def _coverage_payload(
    *,
    issue_df: pd.DataFrame,
    expected_entities: Iterable[str],
    expected_metric_names: Iterable[str],
    expected_forecast_days: int,
) -> dict[str, Any]:
    expected_entity_ids = _sorted_values(expected_entities)
    expected_metrics = _sorted_values(expected_metric_names)
    actual_entity_ids = _sorted_values(issue_df["entity_id"].dropna().tolist())
    actual_metrics = _sorted_values(issue_df["metric_name"].dropna().tolist())
    actual_forecast_date_values = sorted(
        pd.Timestamp(forecast_date).date()
        for forecast_date in issue_df["forecast_date"].dropna().unique()
    )
    actual_forecast_dates = [
        str(forecast_date) for forecast_date in actual_forecast_date_values
    ]
    expected_forecast_dates = []
    missing_forecast_dates = []
    unexpected_forecast_dates = []
    if actual_forecast_date_values:
        first_forecast_date = actual_forecast_date_values[0]
        expected_forecast_date_values = [
            first_forecast_date + timedelta(days=day_offset)
            for day_offset in range(expected_forecast_days)
        ]
        expected_forecast_dates = [
            str(forecast_date) for forecast_date in expected_forecast_date_values
        ]
        actual_forecast_date_set = set(actual_forecast_date_values)
        expected_forecast_date_set = set(expected_forecast_date_values)
        missing_forecast_dates = [
            str(forecast_date)
            for forecast_date in expected_forecast_date_values
            if forecast_date not in actual_forecast_date_set
        ]
        unexpected_forecast_dates = [
            str(forecast_date)
            for forecast_date in actual_forecast_date_values
            if forecast_date not in expected_forecast_date_set
        ]

    missing_entity_ids = [
        entity_id for entity_id in expected_entity_ids if entity_id not in actual_entity_ids
    ]
    unexpected_entity_ids = [
        entity_id for entity_id in actual_entity_ids if entity_id not in expected_entity_ids
    ]
    missing_metric_names = [
        metric for metric in expected_metrics if metric not in actual_metrics
    ]
    unexpected_metric_names = [
        metric for metric in actual_metrics if metric not in expected_metrics
    ]

    observed_keys = {
        (str(row.entity_id), str(row.forecast_date), str(row.metric_name))
        for row in issue_df[["entity_id", "forecast_date", "metric_name"]].itertuples(
            index=False
        )
    }
    missing_entity_metric_dates = []
    for entity_id in expected_entity_ids:
        for forecast_date in actual_forecast_dates:
            for metric in expected_metrics:
                key = (entity_id, forecast_date, metric)
                if key not in observed_keys:
                    missing_entity_metric_dates.append(
                        {
                            "entity_id": entity_id,
                            "forecast_date": forecast_date,
                            "metric_name": metric,
                        }
                    )

    actual_forecast_day_count = len(actual_forecast_dates)
    is_complete = (
        not missing_entity_ids
        and not unexpected_entity_ids
        and not missing_metric_names
        and not unexpected_metric_names
        and not missing_forecast_dates
        and not unexpected_forecast_dates
        and not missing_entity_metric_dates
        and actual_forecast_day_count == expected_forecast_days
    )
    return {
        "is_complete": is_complete,
        "expected_entity_count": len(expected_entity_ids),
        "actual_entity_count": len(actual_entity_ids),
        "expected_entity_ids": expected_entity_ids,
        "actual_entity_ids": actual_entity_ids,
        "missing_entity_ids": missing_entity_ids,
        "unexpected_entity_ids": unexpected_entity_ids,
        "expected_metric_count": len(expected_metrics),
        "actual_metric_count": len(actual_metrics),
        "expected_metric_names": expected_metrics,
        "actual_metric_names": actual_metrics,
        "missing_metric_names": missing_metric_names,
        "unexpected_metric_names": unexpected_metric_names,
        "expected_forecast_day_count": expected_forecast_days,
        "actual_forecast_day_count": actual_forecast_day_count,
        "expected_forecast_dates": expected_forecast_dates,
        "actual_forecast_dates": actual_forecast_dates,
        "missing_forecast_dates": missing_forecast_dates,
        "unexpected_forecast_dates": unexpected_forecast_dates,
        "missing_entity_metric_date_count": len(missing_entity_metric_dates),
        "missing_entity_metric_date_examples": missing_entity_metric_dates[:50],
    }


def _date_to_utc_datetime(value: object) -> datetime:
    return datetime.combine(pd.Timestamp(value).date(), time.min, tzinfo=timezone.utc)


def _sorted_values(values: Iterable[object]) -> list[str]:
    return sorted({str(value).strip() for value in values if str(value).strip()})


if __name__ == "__main__":
    main()
