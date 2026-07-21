"""Orchestrate WSI daily weighted observed weather refreshes."""

from __future__ import annotations

import logging
from collections.abc import Iterable
from datetime import date, datetime, time, timezone
from typing import Any

import pandas as pd

from backend.scrapes.weather.wsi import daily_weighted_degree_day_observations
from backend.scrapes.weather.wsi import daily_weighted_temperature_observations
from backend.utils.data_availability import emit_data_availability_event

API_SCRAPE_NAME = "wsi_daily_weighted_observations"
DATA_SOURCE_SYSTEM = "wsi"
DATA_AVAILABILITY_TYPE = "freshness_observed"
DATA_GRAIN = "entity_observation_date_metric"

logger = logging.getLogger(__name__)


def main(
    *,
    start_date: date | datetime | str | None = None,
    end_date: date | datetime | str | None = None,
    database: str | None = None,
    run_mode: str = "scheduled",
    metadata: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Run both WSI daily weighted observed scrapes and emit freshness events."""
    temperature_df = daily_weighted_temperature_observations.main(
        start_date=start_date,
        end_date=end_date,
        database=database,
        run_mode=run_mode,
        metadata=metadata,
    )
    events: dict[str, dict[str, Any]] = {}
    if temperature_df is not None:
        events["temperature"] = _emit_freshness_event(
            df=temperature_df,
            dataset=daily_weighted_temperature_observations.API_SCRAPE_NAME,
            source_table=daily_weighted_temperature_observations.TARGET_TABLE_FQN,
            expected_entities=daily_weighted_temperature_observations.DEFAULT_ENTITY_IDS,
            expected_metric_names=(
                daily_weighted_temperature_observations.EXPECTED_METRIC_NAMES
            ),
            scope=daily_weighted_temperature_observations.DEFAULT_REQUEST_REGION,
            database=database,
        )
    else:
        logger.info(
            "No WSI daily weighted observed temperature rows available for freshness"
        )

    degree_day_df = daily_weighted_degree_day_observations.main(
        start_date=start_date,
        end_date=end_date,
        database=database,
        run_mode=run_mode,
        metadata=metadata,
    )
    if degree_day_df is not None:
        events["degree_day"] = _emit_freshness_event(
            df=degree_day_df,
            dataset=daily_weighted_degree_day_observations.API_SCRAPE_NAME,
            source_table=daily_weighted_degree_day_observations.TARGET_TABLE_FQN,
            expected_entities=daily_weighted_degree_day_observations.DEFAULT_STATIONS,
            expected_metric_names=(
                daily_weighted_degree_day_observations.EXPECTED_METRIC_NAMES
            ),
            scope=daily_weighted_degree_day_observations.DEFAULT_REQUEST_REGION,
            database=database,
        )
    else:
        logger.info(
            "No WSI daily weighted observed degree-day rows available for freshness"
        )

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
) -> dict[str, Any]:
    current_df = _prepare_availability_frame(df)
    current_df["observation_date"] = pd.to_datetime(
        current_df["observation_date"],
        errors="coerce",
    ).dt.date

    if current_df.empty:
        latest_observation_date = _latest_observation_date_from_attrs(current_df)
        issue_df = current_df
    else:
        latest_observation_date = current_df["observation_date"].dropna().max()
        if pd.isna(latest_observation_date):
            raise ValueError(
                "Cannot emit WSI daily weighted observed freshness; "
                "observation_date is empty"
            )
        issue_df = current_df[
            current_df["observation_date"] == latest_observation_date
        ].copy()
    coverage = _coverage_payload(
        issue_df=issue_df,
        expected_entities=expected_entities,
        expected_metric_names=expected_metric_names,
        latest_observation_date=latest_observation_date,
    )
    completeness_status = "complete" if coverage["is_complete"] else "partial"
    payload = {
        "scope": scope,
        "latest_observation_date": latest_observation_date.isoformat(),
        "source_banner": current_df.attrs.get("source_banner"),
        "completeness_basis": (
            "expected_entities_and_metrics_for_latest_observation_date"
        ),
        **coverage,
    }
    payload.pop("is_complete", None)
    event_key = (
        f"{dataset}:{DATA_AVAILABILITY_TYPE}:{scope}:"
        f"{latest_observation_date:%Y%m%d}"
    )
    return emit_data_availability_event(
        event_key=event_key,
        dataset=dataset,
        source_system=DATA_SOURCE_SYSTEM,
        availability_type=DATA_AVAILABILITY_TYPE,
        business_date=latest_observation_date,
        window_start=_date_to_utc_datetime(latest_observation_date),
        window_end=_date_to_utc_datetime(latest_observation_date),
        scope=scope,
        grain=DATA_GRAIN,
        source_table=source_table,
        row_count=int(len(issue_df)),
        entity_count=int(issue_df["entity_id"].nunique()),
        period_count=1,
        completeness_status=completeness_status,
        run_id=None,
        payload=payload,
        database=database,
        update_existing=True,
    )


def _prepare_availability_frame(df: pd.DataFrame) -> pd.DataFrame:
    current_df = df.copy()
    required_columns = [
        "observation_date",
        "entity_id",
        "metric_name",
    ]
    for column in required_columns:
        if column not in current_df.columns:
            current_df[column] = pd.Series(dtype="object")
    current_df.attrs.update(df.attrs)
    return current_df


def _latest_observation_date_from_attrs(df: pd.DataFrame) -> date:
    for attr_name in ("request_end_date", "scrape_run_at_utc"):
        value = pd.to_datetime(df.attrs.get(attr_name), errors="coerce", utc=True)
        if not pd.isna(value):
            return pd.Timestamp(value).date()
    raise ValueError(
        "Cannot emit WSI daily weighted observed freshness; empty result has no "
        "request_end_date or scrape timestamp context"
    )


def _coverage_payload(
    *,
    issue_df: pd.DataFrame,
    expected_entities: Iterable[str],
    expected_metric_names: Iterable[str],
    latest_observation_date: date,
) -> dict[str, Any]:
    expected_entity_ids = _sorted_values(expected_entities)
    expected_metrics = _sorted_values(expected_metric_names)
    actual_entity_ids = _sorted_values(issue_df["entity_id"].dropna().tolist())
    actual_metrics = _sorted_values(issue_df["metric_name"].dropna().tolist())

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
        (str(row.entity_id), str(row.metric_name))
        for row in issue_df[["entity_id", "metric_name"]].itertuples(index=False)
    }
    missing_entity_metrics = []
    for entity_id in expected_entity_ids:
        for metric in expected_metrics:
            key = (entity_id, metric)
            if key not in observed_keys:
                missing_entity_metrics.append(
                    {
                        "entity_id": entity_id,
                        "observation_date": latest_observation_date.isoformat(),
                        "metric_name": metric,
                    }
                )

    is_complete = (
        not missing_entity_ids
        and not unexpected_entity_ids
        and not missing_metric_names
        and not unexpected_metric_names
        and not missing_entity_metrics
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
        "missing_entity_metric_count": len(missing_entity_metrics),
        "missing_entity_metric_examples": missing_entity_metrics[:50],
    }


def _date_to_utc_datetime(value: date) -> datetime:
    return datetime.combine(value, time.min, tzinfo=timezone.utc)


def _sorted_values(values: Iterable[object]) -> list[str]:
    return sorted({str(value).strip() for value in values if str(value).strip()})


if __name__ == "__main__":
    main()
