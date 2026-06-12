"""PJM Unverified Five Minute LMPs.

Source definition:
https://dataminer2.pjm.com/feed/unverified_five_min_lmps/definition

Feed metadata reviewed from the PJM Data Miner 2 metadata API on 2026-06-12:
- Feed short name: unverified_five_min_lmps
- Display name: Unverified Five Minute LMPs
- Category: Locational Marginal Prices
- Description: Unverified real-time LMP data for zonal, aggregate, interface,
  hub, and 500 kV bus pnodes. PJM updates this feed frequently during the
  operating day and typically does not replace missed intervals after
  technical issues.
- Posting frequency: Every 5 minutes
- Retention time: 30 days

Columns documented by PJM:
- datetime_beginning_utc: Datetime Beginning UTC
- datetime_beginning_ept: Datetime Beginning EPT
- name: Pricing Node Name
- type: Pricing Node Type
- five_min_rtlmp: Weighted Average LMP
- hourly_lmp: Hourly LMP for Prior Hour
"""

from __future__ import annotations

import logging
from datetime import datetime
from pathlib import Path
import sys
from uuid import uuid4

import pandas as pd
from dateutil.relativedelta import relativedelta

REPO_ROOT = Path(__file__).resolve().parents[4]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from backend import credentials
from backend.scrapes.power.pjm import client
from backend.utils import (
    db,
    script_logging,
)

API_SCRAPE_NAME = "unverified_five_min_lmps"
TARGET_DATABASE: str | None = None
TARGET_SCHEMA = "pjm"
TARGET_TABLE = API_SCRAPE_NAME
TARGET_TABLE_FQN = f"{TARGET_SCHEMA}.{TARGET_TABLE}"
PRIMARY_KEY = [
    "datetime_beginning_utc",
    "datetime_beginning_ept",
    "name",
    "type",
]
DEFAULT_LOOKBACK_DAYS = 2
DEFAULT_LOOKAHEAD_DAYS = 0
DEFAULT_DELTA = relativedelta(days=1)
DEFAULT_PNODE_TYPE = "hub"
PJM_REQUEST_TIMEOUT_SECONDS = 60

logger = logging.getLogger(__name__)


def _pull(
    start_date: str,
    end_date: str,
    pnode_type: str = DEFAULT_PNODE_TYPE,
    run_id: str | None = None,
    database: str | None = None,
) -> pd.DataFrame:
    """Pull one window of PJM unverified five-minute hub LMP rows."""
    df = client.fetch_csv(
        API_SCRAPE_NAME,
        params={
            "datetime_beginning_ept": f"{start_date} to {end_date}",
            "type": pnode_type,
        },
        pipeline_name=API_SCRAPE_NAME,
        run_id=run_id,
        target_table=TARGET_TABLE_FQN,
        database=database,
        log_fetch=True,
        timeout=PJM_REQUEST_TIMEOUT_SECONDS,
    )

    if df.empty:
        return df

    for column in ["datetime_beginning_utc", "datetime_beginning_ept"]:
        df[column] = pd.to_datetime(df[column], format="%m/%d/%Y %I:%M:%S %p")
    for column in ["name", "type"]:
        df[column] = df[column].astype(str).str.strip()
    for column in ["five_min_rtlmp", "hourly_lmp"]:
        df[column] = pd.to_numeric(df[column], errors="coerce")

    return df.drop_duplicates(subset=PRIMARY_KEY, keep="last")


def _upsert(
    df: pd.DataFrame,
    database: str | None = TARGET_DATABASE,
    schema: str = TARGET_SCHEMA,
    table_name: str = TARGET_TABLE,
    primary_key: list[str] | None = None,
) -> None:
    primary_key = primary_key or PRIMARY_KEY
    data_types = db.infer_sql_data_types(df=df)

    db.upsert_dataframe(
        database=database,
        schema=schema,
        table_name=table_name,
        df=df,
        columns=df.columns.tolist(),
        data_types=data_types,
        primary_key=primary_key,
    )


def main(
    start_date: datetime | None = None,
    end_date: datetime | None = None,
    delta: relativedelta = DEFAULT_DELTA,
    pnode_type: str = DEFAULT_PNODE_TYPE,
    database: str | None = None,
) -> pd.DataFrame | None:
    now = datetime.now()
    start_date = start_date or (now - relativedelta(days=DEFAULT_LOOKBACK_DAYS))
    end_date = end_date or (now + relativedelta(days=DEFAULT_LOOKAHEAD_DAYS))
    database = database or credentials.AZURE_POSTGRESQL_DB_NAME
    run_logger = script_logging.init_logging(
        name=API_SCRAPE_NAME,
        log_dir=script_logging.get_log_dir(Path(__file__).parent / "logs"),
        log_to_file=True,
        delete_if_no_errors=True,
    )
    run_id = str(uuid4())
    rows_processed = 0

    try:
        run_logger.header(API_SCRAPE_NAME)
        run_logger.info(f"Run ID: {run_id}")

        current_date = start_date
        while current_date <= end_date:
            params = {
                "start_date": current_date.strftime("%Y-%m-%d 00:00"),
                "end_date": current_date.strftime("%Y-%m-%d 23:55"),
            }
            run_logger.section(
                f"Pulling {pnode_type} data for "
                f"{params['start_date']} to {params['end_date']}..."
            )
            df = _pull(
                start_date=params["start_date"],
                end_date=params["end_date"],
                pnode_type=pnode_type,
                run_id=run_id,
                database=database,
            )

            if df.empty:
                run_logger.section(
                    "No data returned for "
                    f"{params['start_date']} to {params['end_date']}, skipping upsert."
                )
            else:
                run_logger.section(f"Upserting {len(df)} rows...")
                _upsert(df, database=database)
                rows_processed += len(df)
                run_logger.success(
                    "Successfully pulled and upserted data for "
                    f"{params['start_date']} to {params['end_date']}!"
                )

            current_date += delta

        run_logger.success(
            f"{API_SCRAPE_NAME} completed; {rows_processed} rows processed."
        )

    except Exception as e:
        run_logger.exception(f"Pipeline failed: {e}")
        raise

    finally:
        script_logging.close_logging()

    if "df" in locals() and df is not None:
        return df
    return None


if __name__ == "__main__":
    main()
