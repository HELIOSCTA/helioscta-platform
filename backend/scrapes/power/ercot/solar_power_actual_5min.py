"""ERCOT Solar Power Production actual 5-minute averaged values.

Source definition:
https://www.ercot.com/mp/data-products/data-product-details?id=NP4-738-CD
"""

from __future__ import annotations

from datetime import datetime

import pandas as pd
from dateutil.relativedelta import relativedelta

from backend.scrapes.power.ercot.feed_configs import FEED_CONFIGS
from backend.scrapes.power.ercot.public_report_feed import run_public_report


CONFIG = FEED_CONFIGS["solar_power_actual_5min"]
API_SCRAPE_NAME = CONFIG.feed_name
DEFAULT_DELTA = relativedelta(days=1)


def main(
    start_date: datetime | None = None,
    end_date: datetime | None = None,
    delta: relativedelta = DEFAULT_DELTA,
    database: str | None = None,
) -> pd.DataFrame | None:
    """Run the ERCOT solar 5-minute actual production scrape."""
    return run_public_report(
        CONFIG,
        start_date=start_date,
        end_date=end_date,
        delta=delta,
        database=database,
    )


if __name__ == "__main__":
    main()
