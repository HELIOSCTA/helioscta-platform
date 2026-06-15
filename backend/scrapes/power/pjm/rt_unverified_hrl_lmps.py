"""PJM Real-Time Unverified Hourly LMPs.

Source definition:
https://dataminer2.pjm.com/feed/rt_unverified_hrl_lmps/definition

Feed metadata reviewed from the PJM Data Miner 2 metadata API on 2026-06-12:
- Feed short name: rt_unverified_hrl_lmps
- Display name: Real-Time Unverified Hourly LMPs
- Category: Locational Marginal Prices
- Posting frequency: Hourly
- Retention time: 30 days
- Runtime scope: hub, zone, and interface pricing-node types.

Columns documented by PJM:
- datetime_beginning_utc: Datetime Beginning UTC
- datetime_beginning_ept: Datetime Beginning EPT
- pnode_name: Pricing Node Name
- type: Pricing Node Type
- total_lmp_rt: Total LMP RT
- congestion_price_rt: Congestion Price RT
- marginal_loss_price_rt: Marginal Loss Price RT
"""

from __future__ import annotations

from collections.abc import Iterable
from datetime import datetime

from dateutil.relativedelta import relativedelta

from backend.scrapes.power.pjm.data_miner_feed import (
    pull_feed_window,
    run_feed,
    upsert_feed_frame,
)
from backend.scrapes.power.pjm.feed_configs import FEED_CONFIGS


CONFIG = FEED_CONFIGS["rt_unverified_hrl_lmps"]
API_SCRAPE_NAME = CONFIG.feed_name
TARGET_TABLE = CONFIG.target_table
TARGET_TABLE_FQN = CONFIG.target_table_fqn
PRIMARY_KEY = list(CONFIG.primary_key)
DEFAULT_PRICING_NODE_TYPES = CONFIG.pricing_node_types
DEFAULT_DELTA = relativedelta(days=1)


def _pull(
    start_date: str,
    end_date: str,
    pnode_types: str | Iterable[str] | None = DEFAULT_PRICING_NODE_TYPES,
    run_id: str | None = None,
    database: str | None = None,
):
    """Pull one window of hourly unverified RT LMP rows."""
    return pull_feed_window(
        CONFIG,
        start_date=start_date,
        end_date=end_date,
        pnode_types=pnode_types,
        run_id=run_id,
        database=database,
    )


def _upsert(
    df,
    database: str | None = None,
) -> None:
    upsert_feed_frame(df, CONFIG, database=database)


def main(
    start_date: datetime | None = None,
    end_date: datetime | None = None,
    delta: relativedelta = DEFAULT_DELTA,
    pnode_types: str | Iterable[str] | None = DEFAULT_PRICING_NODE_TYPES,
    database: str | None = None,
    metadata: dict | None = None,
):
    return run_feed(
        CONFIG,
        start_date=start_date,
        end_date=end_date,
        delta=delta,
        pnode_types=pnode_types,
        database=database,
        metadata=metadata,
    )


if __name__ == "__main__":
    main()
