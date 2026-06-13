"""PJM Fixed Weighted Average Aggregate Definitions.

Source definition:
https://dataminer2.pjm.com/feed/agg_definitions/definition

Feed metadata reviewed from the PJM Data Miner 2 metadata API on 2026-06-12:
- Feed short name: agg_definitions
- Display name: Fixed Weighted Average Aggregate Definitions
- Category: LMP Model
- Posting frequency: Daily
- Retention time: Indefinitely
- Runtime scope: active aggregate definitions where terminate_date_ept is
  12/31/9999.

Columns documented by PJM:
- effective_date_ept: Effective Date EPT
- terminate_date_ept: Terminate Date EPT
- agg_pnode_id: Aggregate Pnode ID
- agg_pnode_name: Aggregate Pnode Name
- bus_pnode_id: BUS Pnode ID
- bus_pnode_name: BUS Pnode Name
- bus_pnode_factor: BUS Pnode Factor
"""

from __future__ import annotations

from backend.scrapes.power.pjm.data_miner_feed import (
    pull_feed_window,
    run_feed,
    upsert_feed_frame,
)
from backend.scrapes.power.pjm.feed_configs import FEED_CONFIGS


CONFIG = FEED_CONFIGS["agg_definitions"]
API_SCRAPE_NAME = CONFIG.feed_name
TARGET_TABLE = CONFIG.target_table
TARGET_TABLE_FQN = CONFIG.target_table_fqn
PRIMARY_KEY = list(CONFIG.primary_key)


def _pull(
    run_id: str | None = None,
    database: str | None = None,
):
    """Pull the active PJM aggregate-definition reference table."""
    return pull_feed_window(CONFIG, run_id=run_id, database=database)


def _upsert(
    df,
    database: str | None = None,
) -> None:
    upsert_feed_frame(df, CONFIG, database=database)


def main(database: str | None = None):
    return run_feed(CONFIG, database=database)


if __name__ == "__main__":
    main()
