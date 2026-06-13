"""PJM Pricing Nodes.

Source definition:
https://dataminer2.pjm.com/feed/pnode/definition

Feed metadata reviewed from the PJM Data Miner 2 metadata API on 2026-06-12:
- Feed short name: pnode
- Display name: Pricing Nodes
- Category: Reference Data
- Description: Master information on PJM pricing nodes.
- Posting frequency: Daily on Business Days
- Posting day: Daily at 01:00 p.m.
- Retention time: Indefinitely
- Runtime scope: active pricing nodes where termination_date is 12/31/9999.

Columns documented by PJM:
- effective_date: Effective Date
- pnode_id: Pricing Node ID
- pnode_name: Pricing Node Name
- pnode_subtype: Pricing Node Subtype
- pnode_type: Pricing Node Type
- termination_date: Termination Date
- voltage_level: Voltage Level
- zone: Transmission Zone
"""

from __future__ import annotations

from backend.scrapes.power.pjm.data_miner_feed import (
    DataMinerFeedConfig,
    pull_feed_window,
    run_feed,
    upsert_feed_frame,
)


API_SCRAPE_NAME = "pnode"
TARGET_DATABASE: str | None = None
TARGET_SCHEMA = "pjm"
TARGET_TABLE = API_SCRAPE_NAME
TARGET_TABLE_FQN = f"{TARGET_SCHEMA}.{TARGET_TABLE}"
PRIMARY_KEY = ["pnode_id"]

CONFIG = DataMinerFeedConfig(
    feed_name=API_SCRAPE_NAME,
    display_name="Pricing Nodes",
    category="Reference Data",
    posting_frequency="Daily on Business Days",
    retention_time="Indefinitely",
    columns=(
        "pnode_id",
        "pnode_name",
        "pnode_type",
        "pnode_subtype",
        "zone",
        "voltage_level",
        "effective_date",
        "termination_date",
    ),
    primary_key=tuple(PRIMARY_KEY),
    date_columns=("effective_date", "termination_date"),
    numeric_columns=("pnode_id",),
    text_columns=(
        "pnode_name",
        "pnode_type",
        "pnode_subtype",
        "zone",
        "voltage_level",
    ),
    static_params={"termination_date": "12/31/9999 exact"},
    sql_data_types={"pnode_id": "BIGINT"},
    default_lookback_days=0,
    target_schema=TARGET_SCHEMA,
    target_database=TARGET_DATABASE,
)


def _pull(
    run_id: str | None = None,
    database: str | None = None,
):
    """Pull the active PJM pricing-node reference table."""
    return pull_feed_window(CONFIG, run_id=run_id, database=database)


def _upsert(
    df,
    database: str | None = TARGET_DATABASE,
) -> None:
    upsert_feed_frame(df, CONFIG, database=database)


def main(database: str | None = None):
    return run_feed(CONFIG, database=database)


if __name__ == "__main__":
    main()
