"""Orchestrate WSI daily weighted forecast refreshes."""

from __future__ import annotations

import logging
import time as time_module
from collections.abc import Callable, Iterable
from pathlib import Path
from datetime import datetime, time, timedelta, timezone
from typing import Any
from uuid import uuid4

import pandas as pd

from backend import credentials
from backend.scrapes.weather.wsi import daily_weighted_degree_day_forecast
from backend.scrapes.weather.wsi import daily_weighted_temperature_forecast
from backend.scrapes.weather.wsi import client
from backend.utils import script_logging
from backend.utils.data_availability import emit_data_availability_event
from backend.utils.ops_logging import redact_secrets

DATA_SOURCE_SYSTEM = "wsi"
DATA_AVAILABILITY_TYPE = "freshness_forecast"
DATA_GRAIN = "entity_forecast_date_metric"
DEFAULT_EXPECTED_FORECAST_DAYS = 15
DEFAULT_MODEL_RUN_POLL_CEILING_SECONDS = 2 * 60 * 60
DEFAULT_MODEL_RUN_POLL_WAIT_SECONDS = 3 * 60
DEFAULT_DEGREE_DAY_MODEL_RUN_MODELS = [
    model
    for model in daily_weighted_degree_day_forecast.DEFAULT_MODELS
    if model != daily_weighted_degree_day_forecast.DEFAULT_MODEL
]

logger = logging.getLogger(__name__)


class DegreeDayModelRunNotAvailable(RuntimeError):
    """Raised when a WSI WDD model-run snapshot is incomplete after polling."""

    def __init__(
        self,
        message: str,
        *,
        df: pd.DataFrame,
        availability: dict[str, Any],
        poll_count: int,
    ) -> None:
        super().__init__(message)
        self.df = df
        self.availability = availability
        self.poll_count = poll_count


def main(
    *,
    database: str | None = None,
    run_mode: str = "scheduled",
    metadata: dict[str, Any] | None = None,
    degree_day_models: Iterable[str] | None = None,
    degree_day_bias_corrected: bool = (
        daily_weighted_degree_day_forecast.DEFAULT_BIAS_CORRECTED
    ),
) -> dict[str, Any]:
    """Run both WSI daily weighted forecast scrapes and emit freshness events."""
    selected_degree_day_models = (
        list(degree_day_models)
        if degree_day_models is not None
        else list(daily_weighted_degree_day_forecast.DEFAULT_MODELS)
    )
    temperature_df = daily_weighted_temperature_forecast.main(
        database=database,
        run_mode=run_mode,
        metadata=metadata,
    )
    events: dict[str, Any] = {}
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

    degree_day_by_model: dict[str, pd.DataFrame] = {}
    degree_day_failures: list[tuple[str, BaseException]] = []
    events["degree_day"] = {}
    for model in selected_degree_day_models:
        try:
            degree_day_df = daily_weighted_degree_day_forecast.main(
                database=database,
                run_mode=run_mode,
                metadata=metadata,
                model=model,
                bias_corrected=degree_day_bias_corrected,
            )

            if degree_day_df is None:
                logger.info(
                    "No WSI daily weighted degree-day rows available for model %s",
                    model,
                )
                continue

            degree_day_by_model[model] = degree_day_df
            events["degree_day"][model] = _emit_freshness_event(
                df=degree_day_df,
                dataset=daily_weighted_degree_day_forecast.API_SCRAPE_NAME,
                source_table=daily_weighted_degree_day_forecast.TARGET_TABLE_FQN,
                expected_entities=daily_weighted_degree_day_forecast.DEFAULT_STATIONS,
                expected_metric_names=(
                    daily_weighted_degree_day_forecast.expected_metric_names_for_model(
                        model
                    )
                ),
                scope=daily_weighted_degree_day_forecast.DEFAULT_REQUEST_REGION,
                database=database,
                payload_context={
                    "model": model,
                    "bias_corrected": degree_day_bias_corrected,
                },
            )
        except Exception as exc:
            logger.exception("WSI daily weighted degree-day model %s failed", model)
            degree_day_failures.append((model, exc))
            continue

    degree_day_df = (
        pd.concat(degree_day_by_model.values(), ignore_index=True)
        if degree_day_by_model
        else pd.DataFrame()
    )
    if not degree_day_by_model:
        logger.info("No WSI daily weighted degree-day rows available for freshness")

    for event in _iter_events(events):
        status = "created" if event.get("created") else "already existed"
        logger.info("Data availability event %s %s.", event["event_key"], status)

    if degree_day_failures:
        failed_models = ", ".join(model for model, _exc in degree_day_failures)
        raise RuntimeError(
            "WSI daily weighted degree-day model refresh failed for "
            f"{failed_models}"
        ) from degree_day_failures[0][1]

    return {
        "temperature": temperature_df,
        "degree_day": degree_day_df,
        "degree_day_by_model": degree_day_by_model,
        "events": events,
    }


def run_degree_day_model_run_instance(
    instance: str,
    *,
    metadata: dict[str, Any] | None = None,
) -> pd.DataFrame | None:
    """Run a systemd instance such as ``GFS_OP-00Z``."""
    model, model_run_cycle = _parse_degree_day_model_run_instance(instance)
    return run_degree_day_model_run(
        model=model,
        model_run_cycle=model_run_cycle,
        metadata={
            "scheduler": "systemd",
            "systemd_instance": instance,
            **(metadata or {}),
        },
    )


def run_degree_day_model_run(
    *,
    model: str,
    model_run_cycle: str,
    request_region: str = daily_weighted_degree_day_forecast.DEFAULT_REQUEST_REGION,
    stations: Iterable[str] | None = None,
    data_types: Iterable[str] | None = None,
    forecast_type: str = daily_weighted_degree_day_forecast.DEFAULT_FORECAST_TYPE,
    bias_corrected: bool = (
        daily_weighted_degree_day_forecast.DEFAULT_BIAS_CORRECTED
    ),
    database: str | None = None,
    run_mode: str = "scheduled",
    metadata: dict[str, Any] | None = None,
    expected_entities: Iterable[str] | None = None,
    expected_metric_names: Iterable[str] | None = None,
    expected_forecast_days: int = DEFAULT_EXPECTED_FORECAST_DAYS,
    poll_ceiling_seconds: int = DEFAULT_MODEL_RUN_POLL_CEILING_SECONDS,
    poll_wait_seconds: int = DEFAULT_MODEL_RUN_POLL_WAIT_SECONDS,
    sleep_fn: Callable[[float], None] = time_module.sleep,
) -> pd.DataFrame | None:
    """Poll one WSI weighted degree-day model/cycle and upsert only if complete."""
    database = database or credentials.AZURE_POSTGRESQL_DB_NAME
    normalized_model = str(model).strip().upper()
    normalized_model_run_cycle = _normalize_model_run_cycle(model_run_cycle)
    selected_stations = list(
        stations or daily_weighted_degree_day_forecast.DEFAULT_STATIONS
    )
    selected_expected_entities = list(expected_entities or selected_stations)
    selected_expected_metric_names = list(
        expected_metric_names
        or daily_weighted_degree_day_forecast.expected_metric_names_for_model(
            normalized_model
        )
    )
    run_logger = script_logging.init_logging(
        name=(
            daily_weighted_degree_day_forecast.API_SCRAPE_NAME
            + "_model_run"
        ),
        log_dir=script_logging.get_log_dir(Path(__file__).parent / "logs"),
        log_to_file=True,
        delete_if_no_errors=True,
    )
    run_id = str(uuid4())

    try:
        run_logger.header(
            daily_weighted_degree_day_forecast.API_SCRAPE_NAME
            + "_model_run"
        )
        run_logger.info(f"Run ID: {run_id}")
        run_logger.info(f"Run mode: {run_mode}")
        run_logger.info(f"Model: {normalized_model}")
        run_logger.info(f"Model run cycle: {normalized_model_run_cycle}")
        run_logger.info(
            "Polling window: "
            f"{poll_ceiling_seconds // 60}m ceiling, "
            f"{poll_wait_seconds}s interval"
        )
        fetch_metadata = {
            "run_mode": run_mode,
            "model": normalized_model,
            "model_run_cycle": normalized_model_run_cycle,
            "expected_forecast_days": expected_forecast_days,
            **(metadata or {}),
        }
        df = _poll_for_complete_degree_day_model_run(
            request_region=request_region,
            stations=selected_stations,
            data_types=data_types,
            model=normalized_model,
            model_run_cycle=normalized_model_run_cycle,
            forecast_type=forecast_type,
            bias_corrected=bias_corrected,
            run_id=run_id,
            database=database,
            metadata=fetch_metadata,
            expected_entities=selected_expected_entities,
            expected_metric_names=selected_expected_metric_names,
            expected_forecast_days=expected_forecast_days,
            poll_ceiling_seconds=poll_ceiling_seconds,
            poll_wait_seconds=poll_wait_seconds,
            sleep_fn=sleep_fn,
        )

        if df.empty:
            run_logger.section(
                "Complete WSI WDD model-run poll returned no rows; skipping upsert."
            )
        else:
            run_logger.section(f"Upserting {len(df)} complete model-run rows...")
            daily_weighted_degree_day_forecast._upsert(df, database=database)
            deleted_rows = daily_weighted_degree_day_forecast._purge_old_rows(
                retention_days=daily_weighted_degree_day_forecast.DEFAULT_RETENTION_DAYS,
                database=database,
            )
            run_logger.section(
                "Retention purge removed "
                f"{deleted_rows} rows older than "
                f"{daily_weighted_degree_day_forecast.DEFAULT_RETENTION_DAYS} days."
            )

        event = _emit_degree_day_model_run_freshness_event(
            df=df,
            request_region=request_region,
            model=normalized_model,
            model_run_cycle=normalized_model_run_cycle,
            bias_corrected=bias_corrected,
            expected_entities=selected_expected_entities,
            expected_metric_names=selected_expected_metric_names,
            expected_forecast_days=expected_forecast_days,
            run_id=run_id,
            database=database,
        )
        status = "created" if event.get("created") else "already existed"
        run_logger.info("Data availability event %s %s.", event["event_key"], status)
        run_logger.success(
            f"{daily_weighted_degree_day_forecast.API_SCRAPE_NAME} "
            f"{normalized_model} {normalized_model_run_cycle} completed; "
            f"{len(df)} rows processed."
        )
        return df if not df.empty else None
    except DegreeDayModelRunNotAvailable as exc:
        _emit_incomplete_degree_day_model_run_event(
            exc=exc,
            request_region=request_region,
            model=normalized_model,
            model_run_cycle=normalized_model_run_cycle,
            bias_corrected=bias_corrected,
            expected_entities=selected_expected_entities,
            expected_metric_names=selected_expected_metric_names,
            expected_forecast_days=expected_forecast_days,
            run_id=run_id,
            database=database,
            run_logger=run_logger,
        )
        run_logger.exception(f"Pipeline failed: {redact_secrets(str(exc))}")
        raise
    except Exception as exc:
        run_logger.exception(f"Pipeline failed: {redact_secrets(str(exc))}")
        raise
    finally:
        script_logging.close_logging()


def _poll_for_complete_degree_day_model_run(
    *,
    request_region: str,
    stations: list[str],
    data_types: Iterable[str] | None,
    model: str,
    model_run_cycle: str,
    forecast_type: str,
    bias_corrected: bool,
    run_id: str | None,
    database: str | None,
    metadata: dict[str, Any],
    expected_entities: Iterable[str],
    expected_metric_names: Iterable[str],
    expected_forecast_days: int,
    poll_ceiling_seconds: int,
    poll_wait_seconds: int,
    sleep_fn: Callable[[float], None],
) -> pd.DataFrame:
    if poll_ceiling_seconds < 0:
        raise ValueError("poll_ceiling_seconds cannot be negative.")
    if poll_wait_seconds < 0:
        raise ValueError("poll_wait_seconds cannot be negative.")

    started = time_module.perf_counter()
    poll_count = 0

    while True:
        poll_count += 1
        try:
            df = daily_weighted_degree_day_forecast._pull(
                request_region=request_region,
                stations=stations,
                data_types=data_types,
                model=model,
                forecast_type=forecast_type,
                bias_corrected=bias_corrected,
                model_run_cycle=model_run_cycle,
                run_id=run_id,
                database=database,
                metadata={
                    **metadata,
                    "poll_count": poll_count,
                },
            )
        except Exception as exc:
            elapsed_seconds = time_module.perf_counter() - started
            _log_degree_day_model_run_poll_result(
                run_id=run_id,
                database=database,
                status="failure",
                elapsed_seconds=elapsed_seconds,
                poll_count=poll_count,
                rows_returned=None,
                metadata=metadata,
                error_type=type(exc).__name__,
                error_message=str(exc),
            )
            raise

        availability = _degree_day_model_run_availability(
            df=df,
            model=model,
            model_run_cycle=model_run_cycle,
            bias_corrected=bias_corrected,
            expected_entities=expected_entities,
            expected_metric_names=expected_metric_names,
            expected_forecast_days=expected_forecast_days,
        )
        elapsed_seconds = time_module.perf_counter() - started
        if availability["is_complete"]:
            _log_degree_day_model_run_poll_result(
                run_id=run_id,
                database=database,
                status="success",
                elapsed_seconds=elapsed_seconds,
                poll_count=poll_count,
                rows_returned=len(df),
                metadata={**metadata, **_availability_poll_metadata(availability)},
            )
            return df

        if elapsed_seconds >= poll_ceiling_seconds:
            message = str(availability["message"])
            _log_degree_day_model_run_poll_result(
                run_id=run_id,
                database=database,
                status="failure",
                elapsed_seconds=elapsed_seconds,
                poll_count=poll_count,
                rows_returned=len(df),
                metadata={**metadata, **_availability_poll_metadata(availability)},
                error_type=DegreeDayModelRunNotAvailable.__name__,
                error_message=message,
            )
            raise DegreeDayModelRunNotAvailable(
                message,
                df=df,
                availability=availability,
                poll_count=poll_count,
            )

        sleep_seconds = min(
            float(poll_wait_seconds),
            poll_ceiling_seconds - elapsed_seconds,
        )
        if sleep_seconds > 0:
            sleep_fn(sleep_seconds)


def _degree_day_model_run_availability(
    *,
    df: pd.DataFrame,
    model: str,
    model_run_cycle: str,
    bias_corrected: bool,
    expected_entities: Iterable[str],
    expected_metric_names: Iterable[str],
    expected_forecast_days: int,
) -> dict[str, Any]:
    current_df = _prepare_availability_frame(df)
    current_df["forecast_date"] = pd.to_datetime(
        current_df["forecast_date"],
        errors="coerce",
    ).dt.date
    if current_df.empty:
        issue_df = current_df
        latest_issue_key = current_df.attrs.get("source_issue_key")
    else:
        latest_issue_key = _latest_issue_key(current_df)
        issue_df = current_df[current_df["source_issue_key"] == latest_issue_key].copy()

    coverage = _coverage_payload(
        issue_df=issue_df,
        expected_entities=expected_entities,
        expected_metric_names=expected_metric_names,
        expected_forecast_days=expected_forecast_days,
    )
    expected_cycle = _normalize_model_run_cycle(model_run_cycle)
    actual_source_init_cycles = _sorted_values(
        issue_df["source_init_cycle"].dropna().tolist()
    )
    actual_model_run_cycles = _sorted_values(
        issue_df["model_run_cycle"].dropna().tolist()
    )
    actual_models = _sorted_values(issue_df["model"].dropna().tolist())
    actual_bias_corrected = sorted(
        {bool(value) for value in issue_df["bias_corrected"].dropna().tolist()}
    )
    missing_source_init_cycles = (
        [] if expected_cycle in actual_source_init_cycles else [expected_cycle]
    )
    unexpected_source_init_cycles = [
        cycle for cycle in actual_source_init_cycles if cycle != expected_cycle
    ]
    unexpected_model_run_cycles = [
        cycle for cycle in actual_model_run_cycles if cycle != expected_cycle
    ]
    unexpected_models = [actual_model for actual_model in actual_models if actual_model != model]
    unexpected_bias_corrected = [
        value for value in actual_bias_corrected if value != bias_corrected
    ]
    is_complete = (
        coverage["is_complete"]
        and not missing_source_init_cycles
        and not unexpected_source_init_cycles
        and not unexpected_model_run_cycles
        and not unexpected_models
        and not unexpected_bias_corrected
    )
    message = (
        "target WSI weighted degree-day model run is complete"
        if is_complete
        else (
            "WSI weighted degree-day model run is not complete for "
            f"{model} {expected_cycle}: "
            f"source_init_cycles={actual_source_init_cycles}, "
            f"model_run_cycles={actual_model_run_cycles}, "
            f"entities={coverage['actual_entity_count']}/"
            f"{coverage['expected_entity_count']}, "
            f"metrics={coverage['actual_metric_count']}/"
            f"{coverage['expected_metric_count']}, "
            f"forecast_days={coverage['actual_forecast_day_count']}/"
            f"{coverage['expected_forecast_day_count']}"
        )
    )
    return {
        **coverage,
        "is_complete": is_complete,
        "message": message,
        "latest_source_issue_key": latest_issue_key,
        "expected_model": model,
        "actual_models": actual_models,
        "unexpected_models": unexpected_models,
        "expected_bias_corrected": bias_corrected,
        "actual_bias_corrected": actual_bias_corrected,
        "unexpected_bias_corrected": unexpected_bias_corrected,
        "expected_model_run_cycle": expected_cycle,
        "actual_model_run_cycles": actual_model_run_cycles,
        "unexpected_model_run_cycles": unexpected_model_run_cycles,
        "expected_source_init_cycle": expected_cycle,
        "actual_source_init_cycles": actual_source_init_cycles,
        "missing_source_init_cycles": missing_source_init_cycles,
        "unexpected_source_init_cycles": unexpected_source_init_cycles,
    }


def _emit_degree_day_model_run_freshness_event(
    *,
    df: pd.DataFrame,
    request_region: str,
    model: str,
    model_run_cycle: str,
    bias_corrected: bool,
    expected_entities: Iterable[str],
    expected_metric_names: Iterable[str],
    expected_forecast_days: int,
    run_id: str | None,
    database: str | None,
    availability: dict[str, Any] | None = None,
    completeness_status_override: str | None = None,
) -> dict[str, Any]:
    payload_context = {
        "model": model,
        "bias_corrected": bias_corrected,
        "model_run_cycle": model_run_cycle,
    }
    if availability:
        payload_context.update(_availability_poll_metadata(availability))
    return _emit_freshness_event(
        df=df,
        dataset=daily_weighted_degree_day_forecast.API_SCRAPE_NAME,
        source_table=daily_weighted_degree_day_forecast.TARGET_TABLE_FQN,
        expected_entities=expected_entities,
        expected_metric_names=expected_metric_names,
        expected_forecast_days=expected_forecast_days,
        scope=request_region,
        database=database,
        payload_context=payload_context,
        run_id=run_id,
        completeness_status_override=completeness_status_override,
    )


def _emit_incomplete_degree_day_model_run_event(
    *,
    exc: DegreeDayModelRunNotAvailable,
    request_region: str,
    model: str,
    model_run_cycle: str,
    bias_corrected: bool,
    expected_entities: Iterable[str],
    expected_metric_names: Iterable[str],
    expected_forecast_days: int,
    run_id: str | None,
    database: str | None,
    run_logger: Any,
) -> None:
    try:
        event = _emit_degree_day_model_run_freshness_event(
            df=exc.df,
            request_region=request_region,
            model=model,
            model_run_cycle=model_run_cycle,
            bias_corrected=bias_corrected,
            expected_entities=expected_entities,
            expected_metric_names=expected_metric_names,
            expected_forecast_days=expected_forecast_days,
            run_id=run_id,
            database=database,
            availability=exc.availability,
            completeness_status_override="partial",
        )
        status = "created" if event.get("created") else "already existed"
        run_logger.info(
            "Incomplete data availability event %s %s.",
            event["event_key"],
            status,
        )
    except Exception:
        run_logger.exception(
            "Failed to emit incomplete WSI WDD model-run freshness event."
        )


def _log_degree_day_model_run_poll_result(
    *,
    run_id: str | None,
    database: str | None,
    status: str,
    elapsed_seconds: float,
    poll_count: int,
    metadata: dict[str, Any],
    rows_returned: int | None = None,
    error_type: str | None = None,
    error_message: str | None = None,
) -> None:
    client.log_wsi_fetch_event(
        base_url=daily_weighted_degree_day_forecast.DEFAULT_BASE_URL,
        pipeline_name=daily_weighted_degree_day_forecast.API_SCRAPE_NAME,
        operation_name=(
            daily_weighted_degree_day_forecast.API_SCRAPE_NAME
            + "_model_run_poll"
        ),
        target_table=daily_weighted_degree_day_forecast.TARGET_TABLE_FQN,
        status=status,
        http_status=200 if status == "success" else None,
        elapsed_ms=round(elapsed_seconds * 1000),
        run_id=run_id,
        feed_name=daily_weighted_degree_day_forecast.API_SCRAPE_NAME,
        database=database,
        rows_returned=rows_returned,
        error_type=error_type,
        error_message=error_message,
        metadata={
            **metadata,
            "poll_count": poll_count,
            "poll_seconds": round(elapsed_seconds, 1),
        },
    )


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
    payload_context: dict[str, Any] | None = None,
    run_id: str | None = None,
    completeness_status_override: str | None = None,
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
    completeness_status = (
        completeness_status_override
        if completeness_status_override is not None
        else ("complete" if coverage["is_complete"] else "partial")
    )
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
        **(payload_context or {}),
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
        run_id=run_id,
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
        "source_init_at_utc",
        "source_init_cycle",
        "model_run_cycle",
        "forecast_date",
        "forecast_day",
        "entity_id",
        "model",
        "bias_corrected",
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


def _iter_events(events: dict[str, Any]) -> Iterable[dict[str, Any]]:
    for event_or_group in events.values():
        if isinstance(event_or_group, dict) and "event_key" in event_or_group:
            yield event_or_group
        elif isinstance(event_or_group, dict):
            for event in event_or_group.values():
                if isinstance(event, dict):
                    yield event


def _sorted_values(values: Iterable[object]) -> list[str]:
    return sorted({str(value).strip() for value in values if str(value).strip()})


def _normalize_model_run_cycle(value: object) -> str:
    normalized = daily_weighted_degree_day_forecast._normalize_model_run_cycle(value)
    if not normalized:
        raise ValueError("model_run_cycle is required.")
    return normalized


def _parse_degree_day_model_run_instance(instance: str) -> tuple[str, str]:
    model, separator, model_run_cycle = str(instance).strip().rpartition("-")
    if not separator:
        raise ValueError(
            "WSI WDD model-run systemd instance must look like MODEL-00Z."
        )
    normalized_model = model.strip().upper()
    normalized_cycle = _normalize_model_run_cycle(model_run_cycle)
    if normalized_model not in DEFAULT_DEGREE_DAY_MODEL_RUN_MODELS:
        raise ValueError(
            f"Unsupported WSI WDD model-run model '{normalized_model}'. "
            f"Expected one of {DEFAULT_DEGREE_DAY_MODEL_RUN_MODELS}."
        )
    return normalized_model, normalized_cycle


def _availability_poll_metadata(availability: dict[str, Any]) -> dict[str, Any]:
    keys = [
        "latest_source_issue_key",
        "expected_model",
        "actual_models",
        "unexpected_models",
        "expected_bias_corrected",
        "actual_bias_corrected",
        "unexpected_bias_corrected",
        "expected_model_run_cycle",
        "actual_model_run_cycles",
        "unexpected_model_run_cycles",
        "expected_source_init_cycle",
        "actual_source_init_cycles",
        "missing_source_init_cycles",
        "unexpected_source_init_cycles",
        "expected_entity_count",
        "actual_entity_count",
        "missing_entity_ids",
        "unexpected_entity_ids",
        "expected_metric_count",
        "actual_metric_count",
        "missing_metric_names",
        "unexpected_metric_names",
        "expected_forecast_day_count",
        "actual_forecast_day_count",
        "missing_forecast_dates",
        "unexpected_forecast_dates",
        "missing_entity_metric_date_count",
        "missing_entity_metric_date_examples",
    ]
    return {key: availability[key] for key in keys if key in availability}


if __name__ == "__main__":
    main()
