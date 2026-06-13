"""ERCOT Actual System Load by Forecast Zone.

Source definition:
https://www.ercot.com/mp/data-products/data-product-details?id=NP6-346-CD

Feed metadata reviewed from legacy reference code and live API probe on
2026-06-13:
- Feed short name: actual_system_load
- EMIL ID: NP6-346-CD
- Display name: Actual System Load by Forecast Zone
- Endpoint: np6-346-cd/act_sys_load_by_fzn
"""

from __future__ import annotations

from datetime import datetime

from dateutil.relativedelta import relativedelta

from backend.scrapes.power.ercot.feed_configs import FEED_CONFIGS
from backend.scrapes.power.ercot.public_report_feed import run_public_report


CONFIG = FEED_CONFIGS["actual_system_load"]
API_SCRAPE_NAME = CONFIG.feed_name
TARGET_DATABASE: str | None = CONFIG.target_database
TARGET_SCHEMA = CONFIG.target_schema
TARGET_TABLE = CONFIG.target_table
TARGET_TABLE_FQN = CONFIG.target_table_fqn
PRIMARY_KEY = list(CONFIG.primary_key)
DEFAULT_DELTA = relativedelta(days=1)
DEFAULT_LOOKBACK_DAYS = CONFIG.default_lookback_days
DEFAULT_LOOKAHEAD_DAYS = CONFIG.default_lookahead_days


def _resolve_default_start_date() -> datetime:
    return datetime.now() - relativedelta(days=DEFAULT_LOOKBACK_DAYS)


def _resolve_default_end_date() -> datetime:
    return datetime.now() + relativedelta(days=DEFAULT_LOOKAHEAD_DAYS)


def main(
    start_date: datetime | None = None,
    end_date: datetime | None = None,
    delta: relativedelta = DEFAULT_DELTA,
    database: str | None = None,
):
    """Run the ERCOT actual system load scrape."""
    return run_public_report(
        CONFIG,
        start_date=start_date or _resolve_default_start_date(),
        end_date=end_date or _resolve_default_end_date(),
        delta=delta,
        database=database,
    )


if __name__ == "__main__":
    main()
