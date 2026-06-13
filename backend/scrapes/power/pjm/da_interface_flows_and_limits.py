"""PJM Day Ahead Interface Flows and Limits scrape."""

from __future__ import annotations

from backend.scrapes.power.pjm.data_miner_feed import pull_feed_window, run_feed
from backend.scrapes.power.pjm.feed_configs import FEED_CONFIGS


CONFIG = FEED_CONFIGS["da_interface_flows_and_limits"]
API_SCRAPE_NAME = CONFIG.feed_name
TARGET_TABLE = CONFIG.target_table
TARGET_TABLE_FQN = CONFIG.target_table_fqn
PRIMARY_KEY = list(CONFIG.primary_key)


def _pull(*args, **kwargs):
    return pull_feed_window(CONFIG, *args, **kwargs)


def main(*args, **kwargs):
    return run_feed(CONFIG, *args, **kwargs)


if __name__ == "__main__":
    main()
