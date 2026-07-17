"""Orchestrate CAISO day-ahead LMPs."""
from __future__ import annotations

import logging
from pathlib import Path
import time
from typing import Any
from urllib.parse import urlsplit
from uuid import uuid4
from zoneinfo import ZoneInfo

import pandas as pd
from dateutil.relativedelta import relativedelta

from backend import credentials
from backend.orchestration.power.caiso import _lmp_readiness
from backend.scrapes.power.caiso import _lmp
from backend.scrapes.power.caiso import oasis
from backend.scrapes.power.caiso import da_lmps as scrape
from backend.utils import script_logging
from backend.utils.ops_logging import log_api_fetch, redact_secrets


API_SCRAPE_NAME = scrape.API_SCRAPE_NAME
TARGET_DATABASE: str | None = None
TARGET_SCHEMA = scrape.TARGET_SCHEMA
TARGET_TABLE = scrape.TARGET_TABLE
TARGET_TABLE_FQN = scrape.TARGET_TABLE_FQN
DATASET_NAME = "caiso_da_lmps"
DATA_SCOPE = "trading_hubs_np15_sp15"
DATA_GRAIN = "trading_date_hour_node"
INTERVAL_MINUTES = 60
DEFAULT_NODES = scrape.DEFAULT_NODES
DEFAULT_DELTA = relativedelta(days=1)
DEFAULT_LOOKAHEAD_DAYS = scrape.DEFAULT_LOOKAHEAD_DAYS
LOCAL_MARKET_TIMEZONE = scrape.LOCAL_MARKET_TIMEZONE
POLL_CEILING_SECONDS = 4 * 60 * 60
POLL_WAIT_SECONDS = 2 * 60

logger = logging.getLogger(__name__)


class DataNotYetAvailable(Exception):
    """Raised when CAISO OASIS has not published a complete DA market day."""


def main(
    start_date=None,
    end_date=None,
    delta: relativedelta = DEFAULT_DELTA,
    database: str | None = None,
    run_mode: str = "scheduled",
    metadata: dict[str, Any] | None = None,
    nodes: list[str] | tuple[str, ...] | None = None,
    poll_ceiling_seconds: int = POLL_CEILING_SECONDS,
    poll_wait_seconds: int = POLL_WAIT_SECONDS,
) -> pd.DataFrame | None:
    """Run the CAISO DA LMP workflow and emit readiness events."""
    if start_date is None and end_date is None and run_mode == "scheduled":
        target_date = _target_market_date()
        start_date = target_date
        end_date = target_date
    else:
        start_date = _lmp.coerce_trading_date(
            start_date or scrape._resolve_default_start_date()
        )
        end_date = _lmp.coerce_trading_date(
            end_date or scrape._resolve_default_end_date()
        )
    selected_nodes = tuple(nodes or DEFAULT_NODES)
    database = database or credentials.AZURE_POSTGRESQL_DB_NAME
    run_logger = script_logging.init_logging(
        name=API_SCRAPE_NAME,
        log_dir=script_logging.get_log_dir(Path(__file__).parent / "logs"),
        log_to_file=True,
        delete_if_no_errors=True,
    )
    run_id = str(uuid4())
    rows_processed = 0
    frames: list[pd.DataFrame] = []
    combined_df = pd.DataFrame()

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
                    trading_date=current_date,
                    nodes=selected_nodes,
                    run_id=run_id,
                    database=database,
                    metadata=fetch_metadata,
                    poll_ceiling_seconds=poll_ceiling_seconds,
                    poll_wait_seconds=poll_wait_seconds,
                )
            else:
                run_logger.section(f"Pulling data for {current_date:%Y-%m-%d}...")
                df = scrape._pull(
                    trading_date=current_date,
                    nodes=selected_nodes,
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
            expected_nodes=selected_nodes,
        )
        if events:
            for event in events:
                status = "created" if event.get("created") else "already existed"
                run_logger.info(f"Data availability event {event['event_key']} {status}.")
        else:
            run_logger.info(
                "No complete CAISO DA LMP trading date detected; "
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


def _target_market_date(value=None, now: pd.Timestamp | None = None):
    if value is not None:
        return _lmp.coerce_trading_date(value)
    local_now = now or pd.Timestamp.now(tz=ZoneInfo(LOCAL_MARKET_TIMEZONE))
    if local_now.tzinfo is None:
        local_now = local_now.tz_localize(LOCAL_MARKET_TIMEZONE)
    else:
        local_now = local_now.tz_convert(LOCAL_MARKET_TIMEZONE)
    return (local_now + relativedelta(days=DEFAULT_LOOKAHEAD_DAYS)).date()


def _wait_for_complete_data_logged(
    *,
    trading_date,
    nodes: tuple[str, ...],
    run_id: str | None,
    database: str | None,
    metadata: dict[str, Any] | None = None,
    poll_ceiling_seconds: int = POLL_CEILING_SECONDS,
    poll_wait_seconds: int = POLL_WAIT_SECONDS,
) -> pd.DataFrame:
    parsed_url = urlsplit(oasis.OASIS_SINGLE_ZIP_URL)
    business_date = _lmp.coerce_trading_date(trading_date)
    started = time.perf_counter()
    poll_count = 0

    while True:
        poll_count += 1
        try:
            df = _fetch_complete_market_day(
                trading_date=business_date,
                nodes=nodes,
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
                    trading_date=business_date,
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
                trading_date=business_date,
                error_type=type(exc).__name__,
                error_message=str(exc),
            )
            raise

        elapsed_seconds = time.perf_counter() - started
        shape = _market_day_shape(df, business_date, nodes)
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
            trading_date=business_date,
            rows_returned=len(df),
        )
        return df


def _fetch_complete_market_day(
    *,
    trading_date,
    nodes: tuple[str, ...],
    run_id: str | None,
    database: str | None,
    metadata: dict[str, Any] | None,
) -> pd.DataFrame:
    business_date = _lmp.coerce_trading_date(trading_date)
    try:
        df = scrape._pull(
            trading_date=business_date,
            nodes=nodes,
            run_id=run_id,
            database=database,
            metadata=metadata,
            log_fetch=False,
        )
    except RuntimeError as exc:
        if _is_oasis_not_ready_error(str(exc)):
            raise DataNotYetAvailable(str(exc)) from exc
        raise

    shape = _market_day_shape(df, business_date, nodes)
    if not shape["is_complete"]:
        raise DataNotYetAvailable(
            "CAISO DA LMPs are not complete for "
            f"{business_date.isoformat()} "
            f"(rows={shape['row_count']}, nodes={shape['actual_nodes']}, "
            f"periods={shape['period_count']}, "
            f"expected_periods={shape['expected_period_count']}, "
            f"duplicate_keys={shape['duplicate_entity_period_rows']}, "
            f"null_lmp_rows={shape['null_lmp_rows']})"
        )
    return df


def _market_day_shape(
    df: pd.DataFrame,
    business_date,
    expected_nodes: tuple[str, ...],
) -> dict[str, Any]:
    expected_period_count = _expected_period_count_for_date(business_date)
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


def _is_oasis_not_ready_error(message: str) -> bool:
    return "Failed to fetch CAISO OASIS" in message


def _log_poll_result(
    *,
    parsed_url,
    run_id: str | None,
    database: str | None,
    metadata: dict[str, Any] | None,
    status: str,
    elapsed_seconds: float,
    poll_count: int,
    trading_date,
    rows_returned: int | None = None,
    error_type: str | None = None,
    error_message: str | None = None,
) -> None:
    log_api_fetch(
        actor_type="scrape",
        provider="caiso",
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
            "target_trading_date": _lmp.coerce_trading_date(
                trading_date
            ).isoformat(),
            "poll_count": poll_count,
            "poll_seconds": round(elapsed_seconds, 1),
        },
        database=database,
    )


def _emit_data_availability_events(
    *,
    df: pd.DataFrame,
    run_id: str | None,
    database: str | None = TARGET_DATABASE,
    expected_nodes: list[str] | tuple[str, ...] = DEFAULT_NODES,
) -> list[dict[str, Any]]:
    return _lmp_readiness.emit_lmp_data_availability_events(
        df=df,
        run_id=run_id,
        dataset_name=DATASET_NAME,
        source_table=TARGET_TABLE_FQN,
        scope=DATA_SCOPE,
        grain=DATA_GRAIN,
        interval_minutes=INTERVAL_MINUTES,
        expected_nodes=expected_nodes,
        database=database,
    )


def _data_availability_event_key(business_date) -> str:
    return _lmp_readiness.data_availability_event_key(
        dataset_name=DATASET_NAME,
        business_date=business_date,
        scope=DATA_SCOPE,
    )


def _expected_period_count_for_date(business_date) -> int:
    return _lmp_readiness.expected_period_count_for_date(
        business_date,
        interval_minutes=INTERVAL_MINUTES,
    )


if __name__ == "__main__":
    main()
