"""PJM Real-Time Five Minute LMPs.

Source definition:
https://dataminer2.pjm.com/feed/rt_fivemin_hrl_lmps/definition

Feed metadata reviewed from the PJM Data Miner 2 metadata API on 2026-06-12:
- Feed short name: rt_fivemin_hrl_lmps
- Display name: Real-Time Five Minute LMPs
- Category: Locational Marginal Prices
- Description: Verified five-minute Real-Time Energy Market LMP data. PJM
  includes all bus locations, including aggregates. PJM does not allow `type`
  as an API filter for this feed, so this scrape resolves active hub, zone, and
  interface pricing node IDs from the pnode feed and queries by pnode_id.
- Posting frequency: Daily On Business Days
- Retention time: Indefinitely
- Archive cutoff: 186 days

Columns documented by PJM:
- congestion_price_rt: Congestion component of LMP
- datetime_beginning_ept: Datetime Beginning EPT
- datetime_beginning_utc: Datetime Beginning UTC
- equipment: Equipment Description
- marginal_loss_price_rt: Loss component of LMP
- pnode_id: Pricing Node ID
- pnode_name: Pricing Node Name
- row_is_current: Latest Version
- system_energy_price_rt: System energy price
- total_lmp_rt: Total LMP
- type: Pricing Node Type
- version_nbr: Version Number
- voltage: Voltage Level
- zone: Transmission Zone Location
"""

from __future__ import annotations

import logging
from collections.abc import Iterable
from datetime import datetime
from itertools import islice
from pathlib import Path
import sys
from uuid import uuid4

import pandas as pd
from dateutil.relativedelta import relativedelta

REPO_ROOT = Path(__file__).resolve().parents[4]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from backend import credentials
from backend.scrapes.power.pjm import client, pnode
from backend.scrapes.power.pjm.pricing_filters import (
    DEFAULT_PRICING_NODE_TYPES,
    normalize_pricing_node_types,
    pricing_node_type_label,
)
from backend.utils import (
    db,
    script_logging,
)

API_SCRAPE_NAME = "rt_fivemin_hrl_lmps"
TARGET_DATABASE: str | None = None
TARGET_SCHEMA = "pjm"
TARGET_TABLE = API_SCRAPE_NAME
TARGET_TABLE_FQN = f"{TARGET_SCHEMA}.{TARGET_TABLE}"
PRIMARY_KEY = [
    "datetime_beginning_utc",
    "pnode_id",
    "pnode_name",
]
DEFAULT_LOOKBACK_DAYS = 10
DEFAULT_LOOKAHEAD_DAYS = 0
DEFAULT_DELTA = relativedelta(days=1)
# PJM returns HTTP 400 when this feed is queried with comma-separated pnode_id
# values, so keep the default at one ID per request.
DEFAULT_PNODE_ID_BATCH_SIZE = 1
PJM_REQUEST_TIMEOUT_SECONDS = 60

logger = logging.getLogger(__name__)


def _pull(
    start_date: str,
    end_date: str,
    pnode_types: str | Iterable[str] | None = DEFAULT_PRICING_NODE_TYPES,
    pnode_id_batch_size: int = DEFAULT_PNODE_ID_BATCH_SIZE,
    run_id: str | None = None,
    database: str | None = None,
    metadata: dict | None = None,
) -> pd.DataFrame:
    """Pull one window of current verified five-minute RT LMP rows."""
    pnode_ids = _active_pricing_node_ids(
        pnode_types=pnode_types,
        run_id=run_id,
        database=database,
        metadata=metadata,
    )
    if not pnode_ids:
        return pd.DataFrame()

    frames: list[pd.DataFrame] = []
    for pnode_id_batch in _batched(pnode_ids, pnode_id_batch_size):
        frame = client.fetch_csv(
            API_SCRAPE_NAME,
            params={
                "datetime_beginning_ept": f"{start_date} to {end_date}",
                "row_is_current": "1",
                "pnode_id": ",".join(str(pnode_id) for pnode_id in pnode_id_batch),
            },
            pipeline_name=API_SCRAPE_NAME,
            run_id=run_id,
            target_table=TARGET_TABLE_FQN,
            database=database,
            log_fetch=True,
            timeout=PJM_REQUEST_TIMEOUT_SECONDS,
            metadata=metadata,
        )
        if not frame.empty:
            frames.append(frame)

    if not frames:
        return pd.DataFrame()

    df = pd.concat(frames, ignore_index=True)

    if df.empty:
        return df

    for column in ["datetime_beginning_utc", "datetime_beginning_ept"]:
        df[column] = pd.to_datetime(df[column], format="%m/%d/%Y %I:%M:%S %p")
    for column in ["pnode_name", "voltage", "equipment", "type", "zone"]:
        df[column] = df[column].astype("string").str.strip()
    for column in [
        "system_energy_price_rt",
        "total_lmp_rt",
        "congestion_price_rt",
        "marginal_loss_price_rt",
    ]:
        df[column] = pd.to_numeric(df[column], errors="coerce")
    for column in ["pnode_id", "version_nbr"]:
        df[column] = pd.to_numeric(df[column], errors="coerce").astype("Int64")
    df["row_is_current"] = _coerce_bool(df["row_is_current"])
    df = df[df["type"].str.upper().isin(_normalized_upper_node_types(pnode_types))]

    return df.drop_duplicates(subset=PRIMARY_KEY, keep="last")


def _active_pricing_node_ids(
    pnode_types: str | Iterable[str] | None = DEFAULT_PRICING_NODE_TYPES,
    run_id: str | None = None,
    database: str | None = None,
    metadata: dict | None = None,
) -> list[int]:
    """Resolve active pnode IDs for the requested aggregate pricing-node scope."""
    nodes = pnode._pull(run_id=run_id, database=database, metadata=metadata)
    if nodes.empty:
        return []

    pnode_subtypes = _normalized_upper_node_types(pnode_types)
    scoped = nodes[
        nodes["pnode_subtype"].astype("string").str.upper().isin(pnode_subtypes)
    ].copy()
    scoped["pnode_id"] = pd.to_numeric(scoped["pnode_id"], errors="coerce")
    return [
        int(pnode_id)
        for pnode_id in scoped["pnode_id"].dropna().drop_duplicates().sort_values()
    ]


def _normalized_upper_node_types(
    pnode_types: str | Iterable[str] | None = DEFAULT_PRICING_NODE_TYPES,
) -> set[str]:
    return {value.upper() for value in normalize_pricing_node_types(pnode_types)}


def _batched(values: list[int], batch_size: int) -> Iterable[list[int]]:
    if batch_size < 1:
        raise ValueError("pnode_id_batch_size must be at least 1.")

    iterator = iter(values)
    while batch := list(islice(iterator, batch_size)):
        yield batch


def _coerce_bool(values: pd.Series) -> pd.Series:
    if pd.api.types.is_bool_dtype(values):
        return values.fillna(False)
    return (
        values.astype(str)
        .str.strip()
        .str.lower()
        .isin({"true", "t", "1", "yes", "y"})
    )


def _upsert(
    df: pd.DataFrame,
    database: str | None = TARGET_DATABASE,
    schema: str = TARGET_SCHEMA,
    table_name: str = TARGET_TABLE,
    primary_key: list[str] | None = None,
) -> None:
    primary_key = primary_key or PRIMARY_KEY
    data_types = db.infer_sql_data_types(df=df)
    data_types = [
        "BIGINT" if column == "pnode_id" else data_type
        for column, data_type in zip(df.columns, data_types)
    ]

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
    pnode_types: str | Iterable[str] | None = DEFAULT_PRICING_NODE_TYPES,
    pnode_id_batch_size: int = DEFAULT_PNODE_ID_BATCH_SIZE,
    database: str | None = None,
) -> pd.DataFrame | None:
    now = datetime.now()
    start_date = start_date or (now - relativedelta(days=DEFAULT_LOOKBACK_DAYS))
    end_date = end_date or (now + relativedelta(days=DEFAULT_LOOKAHEAD_DAYS))
    database = database or credentials.AZURE_POSTGRESQL_DB_NAME
    node_scope = pricing_node_type_label(pnode_types)
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
        run_logger.info(f"Pricing node scope: {node_scope}")

        current_date = start_date
        while current_date <= end_date:
            params = {
                "start_date": current_date.strftime("%Y-%m-%d 00:00"),
                "end_date": current_date.strftime("%Y-%m-%d 23:55"),
            }
            run_logger.section(
                f"Pulling {node_scope} data for "
                f"{params['start_date']} to {params['end_date']}..."
            )
            df = _pull(
                start_date=params["start_date"],
                end_date=params["end_date"],
                pnode_types=pnode_types,
                pnode_id_batch_size=pnode_id_batch_size,
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
