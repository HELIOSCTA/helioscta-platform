"""NYISO day-ahead hourly zonal LBMPs."""
from __future__ import annotations

import logging
from pathlib import Path
from uuid import uuid4

import pandas as pd
from dateutil.relativedelta import relativedelta

from backend import credentials
from backend.scrapes.power.nyiso import _lmp
from backend.utils import script_logging
from backend.utils.ops_logging import redact_secrets


API_SCRAPE_NAME = "nyiso_da_lmps"
ENDPOINT_INDEX_URL = _lmp.DA_INDEX_URL
ENDPOINT_TEMPLATE = f"{_lmp.DA_ENDPOINT}/{{operating_date:%Y%m%d}}damlbmp_zone.csv"
MARKET_RUN_ID = "DAM"
PRICE_STATUS = "Published"
TIME_RESOLUTION = "hourly"
TARGET_DATABASE: str | None = None
TARGET_SCHEMA = "nyiso"
TARGET_TABLE = "da_lmps"
TARGET_TABLE_FQN = f"{TARGET_SCHEMA}.{TARGET_TABLE}"
PRIMARY_KEY = _lmp.PRIMARY_KEY
TARGET_COLUMNS = _lmp.TARGET_COLUMNS
TARGET_DATA_TYPES = _lmp.TARGET_DATA_TYPES
DEFAULT_NODES = _lmp.DEFAULT_LOAD_ZONE_NODES
DEFAULT_DELTA = relativedelta(days=1)
DEFAULT_LOOKAHEAD_DAYS = 1
LOCAL_MARKET_TIMEZONE = _lmp.LOCAL_MARKET_TIMEZONE

logger = logging.getLogger(__name__)


def endpoint_url_for_date(operating_date) -> str:
    return _lmp.da_csv_url(operating_date)


def _resolve_default_start_date():
    return (
        pd.Timestamp.now(tz=LOCAL_MARKET_TIMEZONE)
        + relativedelta(days=DEFAULT_LOOKAHEAD_DAYS)
    ).date()


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
    """Pull NYISO day-ahead hourly zonal LBMPs for one operating date."""
    return _lmp.pull_lmps(
        operating_date=operating_date,
        market_run_id=MARKET_RUN_ID,
        price_status=PRICE_STATUS,
        time_resolution=TIME_RESOLUTION,
        pipeline_name=API_SCRAPE_NAME,
        target_table=TARGET_TABLE_FQN,
        endpoint_url=endpoint_url_for_date(operating_date),
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
        source_endpoint=endpoint_url_for_date(operating_date),
        market_run_id=MARKET_RUN_ID,
        price_status=PRICE_STATUS,
        time_resolution=TIME_RESOLUTION,
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
    """Run the NYISO day-ahead hourly zonal LBMP scrape."""
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
