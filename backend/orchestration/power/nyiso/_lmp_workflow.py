"""Shared orchestration helpers for NYISO LBMP workflows."""
from __future__ import annotations

import logging
from pathlib import Path
import time
from typing import Any, Callable
from urllib.parse import urlsplit
from uuid import uuid4

import pandas as pd
from dateutil.relativedelta import relativedelta

from backend import credentials
from backend.orchestration.power.nyiso import _lmp_readiness
from backend.scrapes.power.nyiso import _lmp
from backend.utils import script_logging
from backend.utils.ops_logging import log_api_fetch, redact_secrets


logger = logging.getLogger(__name__)


class DataNotYetAvailable(Exception):
    """Raised when NYISO has not published a complete LBMP operating date."""


def run_lmp_workflow(
    *,
    scrape_module: Any,
    dataset_name: str,
    data_scope: str,
    data_grain: str,
    interval_minutes: int,
    target_operating_date: Callable[..., Any],
    start_date=None,
    end_date=None,
    delta: relativedelta,
    database: str | None = None,
    run_mode: str = "scheduled",
    metadata: dict[str, Any] | None = None,
    nodes: list[str] | tuple[str, ...] | None = None,
    poll_ceiling_seconds: int = 0,
    poll_wait_seconds: int = 0,
    release_notification_handler: Callable[..., Any] | None = None,
) -> pd.DataFrame | None:
    """Run one NYISO LBMP workflow and emit readiness events."""
    if start_date is None and end_date is None and run_mode == "scheduled":
        target_date = target_operating_date()
        start_date = target_date
        end_date = target_date
    else:
        start_date = _lmp.coerce_operating_date(
            start_date or scrape_module._resolve_default_start_date()
        )
        end_date = _lmp.coerce_operating_date(
            end_date or scrape_module._resolve_default_end_date()
        )

    selected_nodes = tuple(nodes or scrape_module.DEFAULT_NODES)
    database = database or credentials.AZURE_POSTGRESQL_DB_NAME
    run_logger = script_logging.init_logging(
        name=scrape_module.API_SCRAPE_NAME,
        log_dir=script_logging.get_log_dir(Path(__file__).parent / "logs"),
        log_to_file=True,
        delete_if_no_errors=True,
    )
    run_id = str(uuid4())
    rows_processed = 0
    frames: list[pd.DataFrame] = []
    combined_df = pd.DataFrame()

    try:
        run_logger.header(scrape_module.API_SCRAPE_NAME)
        run_logger.info(f"Run ID: {run_id}")
        run_logger.info(f"Run mode: {run_mode}")
        if run_mode == "scheduled":
            run_logger.info(
                "Polling window: "
                f"{poll_ceiling_seconds}s ceiling, {poll_wait_seconds}s interval"
            )
        fetch_metadata = {"run_mode": run_mode, **(metadata or {})}

        current_date = start_date
        while current_date <= end_date:
            if run_mode == "scheduled":
                run_logger.section(
                    f"Waiting for complete data for {current_date:%Y-%m-%d}..."
                )
                df = wait_for_complete_data_logged(
                    scrape_module=scrape_module,
                    operating_date=current_date,
                    nodes=selected_nodes,
                    run_id=run_id,
                    database=database,
                    metadata=fetch_metadata,
                    poll_ceiling_seconds=poll_ceiling_seconds,
                    poll_wait_seconds=poll_wait_seconds,
                    interval_minutes=interval_minutes,
                )
            else:
                run_logger.section(f"Pulling data for {current_date:%Y-%m-%d}...")
                df = scrape_module._pull(
                    operating_date=current_date,
                    nodes=selected_nodes,
                    run_id=run_id,
                    database=database,
                    metadata=fetch_metadata,
                )

            if df.empty:
                run_logger.section(f"No data returned for {current_date:%Y-%m-%d}.")
            else:
                run_logger.section(f"Upserting {len(df)} rows...")
                scrape_module._upsert(df=df, database=database)
                rows_processed += len(df)
                frames.append(df)
                run_logger.success(
                    f"Successfully pulled and upserted data for "
                    f"{current_date:%Y-%m-%d}."
                )

            current_date += delta

        run_logger.section("Emitting data availability event(s) ...")
        combined_df = pd.concat(frames, ignore_index=True) if frames else pd.DataFrame()
        events = emit_data_availability_events(
            df=combined_df,
            run_id=run_id,
            database=database,
            expected_nodes=selected_nodes,
            dataset_name=dataset_name,
            source_table=scrape_module.TARGET_TABLE_FQN,
            data_scope=data_scope,
            data_grain=data_grain,
            interval_minutes=interval_minutes,
        )
        if events:
            for event in events:
                status = "created" if event.get("created") else "already existed"
                run_logger.info(f"Data availability event {event['event_key']} {status}.")
        else:
            run_logger.info(
                "No complete NYISO LBMP operating date detected; "
                "no data availability event emitted."
            )

        if release_notification_handler is not None:
            run_logger.section("Handling release email notification(s) ...")
            release_notification_handler(
                events=events,
                run_mode=run_mode,
                database=database,
                run_logger=run_logger,
            )

        run_logger.success(
            f"{scrape_module.API_SCRAPE_NAME} completed; "
            f"{rows_processed} rows processed."
        )

    except Exception as exc:
        run_logger.exception(f"Pipeline failed: {redact_secrets(str(exc))}")
        raise
    finally:
        script_logging.close_logging()

    return combined_df if not combined_df.empty else None


def wait_for_complete_data_logged(
    *,
    scrape_module: Any,
    operating_date,
    nodes: tuple[str, ...],
    run_id: str | None,
    database: str | None,
    metadata: dict[str, Any] | None = None,
    poll_ceiling_seconds: int,
    poll_wait_seconds: int,
    interval_minutes: int,
) -> pd.DataFrame:
    business_date = _lmp.coerce_operating_date(operating_date)
    endpoint_url = _endpoint_url_for_date(scrape_module, business_date)
    parsed_url = urlsplit(endpoint_url)
    started = time.perf_counter()
    poll_count = 0

    while True:
        poll_count += 1
        try:
            df = fetch_complete_market_day(
                scrape_module=scrape_module,
                operating_date=business_date,
                nodes=nodes,
                run_id=run_id,
                database=database,
                metadata=metadata,
                interval_minutes=interval_minutes,
            )
        except DataNotYetAvailable as exc:
            elapsed_seconds = time.perf_counter() - started
            if elapsed_seconds >= poll_ceiling_seconds:
                log_poll_result(
                    parsed_url=parsed_url,
                    scrape_module=scrape_module,
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
            log_poll_result(
                parsed_url=parsed_url,
                scrape_module=scrape_module,
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
        shape = market_day_shape(df, business_date, nodes, interval_minutes)
        log_poll_result(
            parsed_url=parsed_url,
            scrape_module=scrape_module,
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


def fetch_complete_market_day(
    *,
    scrape_module: Any,
    operating_date,
    nodes: tuple[str, ...],
    run_id: str | None,
    database: str | None,
    metadata: dict[str, Any] | None,
    interval_minutes: int,
) -> pd.DataFrame:
    business_date = _lmp.coerce_operating_date(operating_date)
    try:
        df = scrape_module._pull(
            operating_date=business_date,
            nodes=nodes,
            run_id=run_id,
            database=database,
            metadata=metadata,
            log_fetch=False,
        )
    except _lmp.NYISOMISDataNotAvailable as exc:
        raise DataNotYetAvailable(str(exc)) from exc

    shape = market_day_shape(df, business_date, nodes, interval_minutes)
    if not shape["is_complete"]:
        raise DataNotYetAvailable(
            "NYISO LBMPs are not complete for "
            f"{business_date.isoformat()} "
            f"(rows={shape['row_count']}, nodes={shape['actual_nodes']}, "
            f"periods={shape['period_count']}, "
            f"expected_periods={shape['expected_period_count']}, "
            f"duplicate_keys={shape['duplicate_entity_period_rows']}, "
            f"null_lmp_rows={shape['null_lmp_rows']})"
        )
    return df


def market_day_shape(
    df: pd.DataFrame,
    business_date,
    expected_nodes: tuple[str, ...],
    interval_minutes: int,
) -> dict[str, Any]:
    expected_period_count = _lmp_readiness.expected_period_count_for_date(
        _lmp.coerce_operating_date(business_date),
        interval_minutes=interval_minutes,
    )
    expected_node_set = set(expected_nodes)
    if df.empty:
        return {
            "is_complete": False,
            "row_count": 0,
            "actual_nodes": [],
            "entity_count": 0,
            "period_count": 0,
            "expected_period_count": expected_period_count,
            "expected_row_count": len(expected_node_set) * expected_period_count,
            "min_periods_per_entity": 0,
            "max_periods_per_entity": 0,
            "duplicate_entity_period_rows": 0,
            "null_lmp_rows": 0,
        }

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
    date_df = current_df.loc[current_df["operating_date"] == business_date].copy()
    actual_node_set = set(date_df["node_id"].dropna().unique())
    periods_per_entity = date_df.groupby("node_id")[
        "interval_start_time_utc"
    ].nunique()
    entity_count = int(date_df["node_id"].nunique())
    period_count = int(date_df["interval_start_time_utc"].nunique())
    min_periods_per_entity = int(periods_per_entity.min()) if entity_count else 0
    max_periods_per_entity = int(periods_per_entity.max()) if entity_count else 0
    duplicate_entity_period_rows = int(
        date_df.duplicated(["node_id", "interval_start_time_utc"]).sum()
    )
    null_lmp_rows = int(date_df["locational_marginal_price"].isna().sum())
    expected_row_count = len(expected_node_set) * expected_period_count
    row_count = int(len(date_df))

    return {
        "is_complete": (
            actual_node_set == expected_node_set
            and period_count == expected_period_count
            and min_periods_per_entity == expected_period_count
            and max_periods_per_entity == expected_period_count
            and row_count == expected_row_count
            and duplicate_entity_period_rows == 0
            and null_lmp_rows == 0
        ),
        "row_count": row_count,
        "actual_nodes": sorted(actual_node_set),
        "entity_count": entity_count,
        "period_count": period_count,
        "expected_period_count": expected_period_count,
        "expected_row_count": expected_row_count,
        "min_periods_per_entity": min_periods_per_entity,
        "max_periods_per_entity": max_periods_per_entity,
        "duplicate_entity_period_rows": duplicate_entity_period_rows,
        "null_lmp_rows": null_lmp_rows,
    }


def log_poll_result(
    *,
    parsed_url,
    scrape_module: Any,
    run_id: str | None,
    database: str | None,
    metadata: dict[str, Any] | None,
    status: str,
    elapsed_seconds: float,
    poll_count: int,
    operating_date,
    rows_returned: int | None = None,
    error_type: str | None = None,
    error_message: str | None = None,
) -> None:
    log_api_fetch(
        actor_type="scrape",
        provider="nyiso",
        pipeline_name=scrape_module.API_SCRAPE_NAME,
        run_id=run_id,
        operation_name=f"{scrape_module.API_SCRAPE_NAME}_poll",
        feed_name=scrape_module.API_SCRAPE_NAME,
        target_table=scrape_module.TARGET_TABLE_FQN,
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
            "target_operating_date": _lmp.coerce_operating_date(
                operating_date
            ).isoformat(),
            "poll_count": poll_count,
            "poll_seconds": round(elapsed_seconds, 1),
            "api_family": "nyiso_mis_csv",
        },
        database=database,
    )


def emit_data_availability_events(
    *,
    df: pd.DataFrame,
    run_id: str | None,
    database: str | None,
    expected_nodes: list[str] | tuple[str, ...],
    dataset_name: str,
    source_table: str,
    data_scope: str,
    data_grain: str,
    interval_minutes: int,
) -> list[dict[str, Any]]:
    return _lmp_readiness.emit_lmp_data_availability_events(
        df=df,
        run_id=run_id,
        dataset_name=dataset_name,
        source_table=source_table,
        scope=data_scope,
        grain=data_grain,
        interval_minutes=interval_minutes,
        expected_nodes=expected_nodes,
        database=database,
    )


def _endpoint_url_for_date(scrape_module: Any, operating_date) -> str:
    if hasattr(scrape_module, "endpoint_url_for_date"):
        return scrape_module.endpoint_url_for_date(operating_date)
    return scrape_module.ENDPOINT_INDEX_URL
