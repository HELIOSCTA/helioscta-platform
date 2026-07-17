"""CAISO day-ahead LMPs for NP15 and SP15 trading hubs.

Source definition:
https://oasis.caiso.com/oasisapi/SingleZip

Feed metadata reviewed from CAISO OASIS FAQ and live OASIS probes on
2026-07-17:
- Query name: PRC_LMP
- Market/process: DAM
- Grain: trading date x hourly interval x pricing node
- Default nodes: TH_NP15_GEN-APND and TH_SP15_GEN-APND
- OASIS timestamps use GMT; trading dates are Pacific market days.
"""
from __future__ import annotations

import logging
from pathlib import Path
from uuid import uuid4
from zoneinfo import ZoneInfo

import pandas as pd
from dateutil.relativedelta import relativedelta

from backend import credentials
from backend.scrapes.power.caiso import _lmp
from backend.utils import script_logging
from backend.utils.ops_logging import redact_secrets


API_SCRAPE_NAME = "da_lmps"
OASIS_QUERY_NAME = "PRC_LMP"
OASIS_VERSION = 12
MARKET_RUN_ID = "DAM"
TARGET_DATABASE: str | None = None
TARGET_SCHEMA = "caiso"
TARGET_TABLE = API_SCRAPE_NAME
TARGET_TABLE_FQN = f"{TARGET_SCHEMA}.{TARGET_TABLE}"
PRIMARY_KEY = _lmp.PRIMARY_KEY
TARGET_COLUMNS = _lmp.TARGET_COLUMNS
TARGET_DATA_TYPES = _lmp.TARGET_DATA_TYPES
DEFAULT_NODES = _lmp.DEFAULT_TRADING_HUB_NODES
DEFAULT_DELTA = relativedelta(days=1)
DEFAULT_LOOKAHEAD_DAYS = 1
DEFAULT_PUBLICATION_HOUR = 13
LOCAL_MARKET_TIMEZONE = _lmp.LOCAL_MARKET_TIMEZONE

logger = logging.getLogger(__name__)


def _local_now() -> pd.Timestamp:
    return pd.Timestamp.now(tz=ZoneInfo(LOCAL_MARKET_TIMEZONE))


def _resolve_default_start_date():
    return _latest_expected_published_trading_date()


def _resolve_default_end_date():
    return _latest_expected_published_trading_date()


def _latest_expected_published_trading_date(now: pd.Timestamp | None = None):
    local_now = now or _local_now()
    if local_now.tzinfo is None:
        local_now = local_now.tz_localize(LOCAL_MARKET_TIMEZONE)
    else:
        local_now = local_now.tz_convert(LOCAL_MARKET_TIMEZONE)

    trading_date = local_now.date()
    if local_now.hour >= DEFAULT_PUBLICATION_HOUR:
        trading_date = trading_date + relativedelta(days=DEFAULT_LOOKAHEAD_DAYS)
    return trading_date


def _pull(
    *,
    trading_date,
    nodes: list[str] | tuple[str, ...] | None = None,
    run_id: str | None = None,
    database: str | None = None,
    metadata: dict | None = None,
) -> pd.DataFrame:
    """Pull CAISO day-ahead LMPs for one Pacific trading date."""
    return _lmp.pull_lmps(
        trading_date=trading_date,
        query_name=OASIS_QUERY_NAME,
        market_run_id=MARKET_RUN_ID,
        version=OASIS_VERSION,
        pipeline_name=API_SCRAPE_NAME,
        target_table=TARGET_TABLE_FQN,
        nodes=nodes or DEFAULT_NODES,
        run_id=run_id,
        database=database,
        metadata=metadata,
    )


def _format(df: pd.DataFrame) -> pd.DataFrame:
    return _lmp.format_oasis_lmp_rows(
        df,
        source_query_name=OASIS_QUERY_NAME,
        source_version=OASIS_VERSION,
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
) -> pd.DataFrame | None:
    """Run the CAISO day-ahead LMP scrape."""
    start_date = _lmp.coerce_trading_date(start_date or _resolve_default_start_date())
    end_date = _lmp.coerce_trading_date(end_date or _resolve_default_end_date())
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
                trading_date=current_date,
                nodes=nodes or DEFAULT_NODES,
                run_id=run_id,
                database=database,
            )

            if df.empty:
                run_logger.section(f"No data returned for {current_date:%Y-%m-%d}.")
            else:
                run_logger.section(f"Upserting {len(df)} rows...")
                _upsert(df=df, database=database)
                rows_processed += len(df)
                frames.append(df)
                run_logger.success(
                    f"Successfully pulled and upserted data for "
                    f"{current_date:%Y-%m-%d}."
                )

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
