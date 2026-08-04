"""MISO day-ahead hourly LMPs for Indiana Hub and ICE-traded hub family."""
from __future__ import annotations

import logging
from pathlib import Path
from uuid import uuid4

import pandas as pd
from dateutil.relativedelta import relativedelta

from backend import credentials
from backend.scrapes.power.miso import _lmp
from backend.utils import script_logging
from backend.utils.ops_logging import redact_secrets


API_SCRAPE_NAME = "miso_da_lmps"
ENDPOINT_TEMPLATE = "day-ahead/{operating_date}/lmp-expost"
MARKET_RUN_ID = "DAM"
PRICE_STATUS = "ExPost"
TARGET_DATABASE: str | None = None
TARGET_SCHEMA = "miso"
TARGET_TABLE = "da_lmps"
TARGET_TABLE_FQN = f"{TARGET_SCHEMA}.{TARGET_TABLE}"
PRIMARY_KEY = _lmp.PRIMARY_KEY
TARGET_COLUMNS = _lmp.TARGET_COLUMNS
TARGET_DATA_TYPES = _lmp.TARGET_DATA_TYPES
DEFAULT_NODES = _lmp.DEFAULT_HUB_NODES
DEFAULT_DELTA = relativedelta(days=1)
DEFAULT_LOOKAHEAD_DAYS = 1
LOCAL_MARKET_TIMEZONE = _lmp.LOCAL_MARKET_TIMEZONE

logger = logging.getLogger(__name__)


def _resolve_default_start_date():
    return (pd.Timestamp.now(tz="UTC") + relativedelta(days=DEFAULT_LOOKAHEAD_DAYS)).date()


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
    """Pull MISO day-ahead hourly LMPs for one operating date."""
    return _lmp.pull_lmps(
        operating_date=operating_date,
        endpoint_template=ENDPOINT_TEMPLATE,
        market_run_id=MARKET_RUN_ID,
        price_status=PRICE_STATUS,
        pipeline_name=API_SCRAPE_NAME,
        target_table=TARGET_TABLE_FQN,
        nodes=nodes or DEFAULT_NODES,
        run_id=run_id,
        database=database,
        metadata=metadata,
        log_fetch=log_fetch,
    )


def _format(records: list[dict], *, operating_date) -> pd.DataFrame:
    return _lmp.format_lmp_records(
        records,
        operating_date=operating_date,
        source_endpoint=ENDPOINT_TEMPLATE.format(
            operating_date=_lmp.coerce_operating_date(operating_date).isoformat()
        ),
        market_run_id=MARKET_RUN_ID,
        price_status=PRICE_STATUS,
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
    """Run the MISO day-ahead hourly LMP scrape."""
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
