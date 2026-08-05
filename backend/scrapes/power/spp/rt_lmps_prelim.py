"""SPP preliminary real-time five-minute LMPs for ICE-traded SPP hubs."""
from __future__ import annotations

import logging
from pathlib import Path
import time
from uuid import uuid4
from zoneinfo import ZoneInfo

import pandas as pd
from dateutil.relativedelta import relativedelta

from backend import credentials
from backend.scrapes.power.spp import _lmp
from backend.utils import script_logging
from backend.utils.ops_logging import redact_secrets


API_SCRAPE_NAME = "spp_rt_lmps_prelim"
MARKET_RUN_ID = "RTBM"
PRICE_STATUS = "Preliminary"
TIME_RESOLUTION = "five_minute"
TARGET_DATABASE: str | None = None
TARGET_SCHEMA = "spp"
TARGET_TABLE = "rt_lmps_prelim"
TARGET_TABLE_FQN = f"{TARGET_SCHEMA}.{TARGET_TABLE}"
PRIMARY_KEY = _lmp.PRIMARY_KEY
TARGET_COLUMNS = _lmp.TARGET_COLUMNS
TARGET_DATA_TYPES = _lmp.TARGET_DATA_TYPES
DEFAULT_NODES = _lmp.DEFAULT_HUB_NODES
DEFAULT_DELTA = relativedelta(days=1)
DEFAULT_LOOKBACK_DAYS = 1
LOCAL_MARKET_TIMEZONE = _lmp.LOCAL_MARKET_TIMEZONE
ENDPOINT_URL = _lmp.RT_ENDPOINT
ENDPOINT_TEMPLATE = (
    "rtbm-lmp-by-location"
    "?path=/{operating_year}/{operating_month}/By_Interval/"
    "{operating_day}/RTBM-LMP-SL-{interval_end}.csv"
)

logger = logging.getLogger(__name__)


def _local_now() -> pd.Timestamp:
    return pd.Timestamp.now(tz=ZoneInfo(LOCAL_MARKET_TIMEZONE))


def _resolve_default_start_date():
    return (_local_now() - relativedelta(days=DEFAULT_LOOKBACK_DAYS)).date()


def _resolve_default_end_date():
    return _resolve_default_start_date()


def _pull(
    *,
    operating_date,
    nodes: list[str] | tuple[str, ...] | None = None,
    run_id: str | None = None,
    database: str | None = None,
    metadata: dict | None = None,
    log_fetch: bool = True,
) -> pd.DataFrame:
    """Pull SPP preliminary real-time five-minute LMPs for one market day."""
    business_date = _lmp.coerce_operating_date(operating_date)
    portal_paths = _lmp.rt_portal_paths_for_day(business_date)
    final_interval_path = portal_paths[-1]
    started = time.perf_counter()
    # Probe the final expected interval first so scheduled polling avoids
    # downloading the whole market day before SPP has published it.
    try:
        _lmp.fetch_portal_csv(
            endpoint_url=ENDPOINT_URL,
            portal_path=final_interval_path,
        )
    except Exception as exc:
        if log_fetch:
            _lmp._log_pull_result(
                endpoint_url=ENDPOINT_URL,
                pipeline_name=API_SCRAPE_NAME,
                run_id=run_id,
                target_table=TARGET_TABLE_FQN,
                database=database,
                metadata={
                    **(metadata or {}),
                    "publication_probe_path": final_interval_path,
                },
                status="failure",
                elapsed_seconds=time.perf_counter() - started,
                rows_returned=None,
                files_expected=len(portal_paths),
                files_fetched=0,
                operating_date=business_date,
                http_status=getattr(exc, "status_code", None),
                error_type=type(exc).__name__,
                error_message=str(exc),
            )
        raise
    return _lmp.pull_lmps(
        operating_date=business_date,
        market_run_id=MARKET_RUN_ID,
        price_status=PRICE_STATUS,
        time_resolution=TIME_RESOLUTION,
        pipeline_name=API_SCRAPE_NAME,
        target_table=TARGET_TABLE_FQN,
        endpoint_url=ENDPOINT_URL,
        portal_paths=portal_paths,
        nodes=nodes or DEFAULT_NODES,
        run_id=run_id,
        database=database,
        metadata=metadata,
        log_fetch=log_fetch,
    )


def _format(df: pd.DataFrame, *, operating_date) -> pd.DataFrame:
    return _lmp.format_lmp_rows(
        df,
        operating_date=operating_date,
        source_endpoint=ENDPOINT_URL,
        market_run_id=MARKET_RUN_ID,
        price_status=PRICE_STATUS,
        time_resolution=TIME_RESOLUTION,
        nodes=DEFAULT_NODES,
    )


def _upsert(
    df: pd.DataFrame,
    database: str | None = TARGET_DATABASE,
    schema: str = TARGET_SCHEMA,
    table_name: str = TARGET_TABLE,
    primary_key: list[str] | None = None,
) -> None:
    _lmp.upsert_lmps(
        df=df,
        database=database,
        schema=schema,
        table_name=table_name,
        primary_key=primary_key,
    )


def main(
    start_date=None,
    end_date=None,
    delta: relativedelta = DEFAULT_DELTA,
    database: str | None = None,
    nodes: list[str] | tuple[str, ...] | None = None,
    metadata: dict | None = None,
) -> pd.DataFrame | None:
    """Run the SPP preliminary real-time five-minute LMP scrape."""
    start_date = _lmp.coerce_operating_date(start_date or _resolve_default_start_date())
    end_date = _lmp.coerce_operating_date(end_date or _resolve_default_end_date())
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

    try:
        run_logger.header(API_SCRAPE_NAME)
        run_logger.info(f"Run ID: {run_id}")

        current_date = start_date
        while current_date <= end_date:
            run_logger.section(f"Pulling data for {current_date:%Y-%m-%d}...")
            df = _pull(
                operating_date=current_date,
                nodes=selected_nodes,
                run_id=run_id,
                database=database,
                metadata=metadata,
            )

            if df.empty:
                run_logger.section(f"No data returned for {current_date:%Y-%m-%d}.")
            else:
                run_logger.section(f"Upserting {len(df)} rows...")
                _upsert(df=df, database=database)
                rows_processed += len(df)
                frames.append(df)

            current_date += delta

        run_logger.success(
            f"{API_SCRAPE_NAME} completed; {rows_processed} rows processed."
        )

    except Exception as exc:
        run_logger.exception(f"Pipeline failed: {redact_secrets(str(exc))}")
        raise
    finally:
        script_logging.close_logging()

    return pd.concat(frames, ignore_index=True) if frames else None


if __name__ == "__main__":
    main()
