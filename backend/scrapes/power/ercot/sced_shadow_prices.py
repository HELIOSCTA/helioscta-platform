"""ERCOT SCED Shadow Prices and Binding Transmission Constraints.

Source definition:
https://www.ercot.com/mp/data-products/data-product-details?id=NP6-86-CD

Feed metadata reviewed from ERCOT Data Product Details on 2026-06-13:
- Feed short name: sced_shadow_prices
- EMIL ID: NP6-86-CD
- Report Type ID: 12302
- Display name: SCED Shadow Prices and Binding Transmission Constraints
- Posting frequency: Chron - Hourly when needed
- Audience: Public
- Channel: Public, EWS, Data Portal
"""

from __future__ import annotations

from datetime import datetime

import pandas as pd
from dateutil.relativedelta import relativedelta

from backend.scrapes.power.ercot.feed_configs import FEED_CONFIGS
from backend.scrapes.power.ercot.public_report_feed import run_public_report


CONFIG = FEED_CONFIGS["sced_shadow_prices"]
API_SCRAPE_NAME = CONFIG.feed_name
DEFAULT_DELTA = relativedelta(days=1)


def main(
    start_date: datetime | None = None,
    end_date: datetime | None = None,
    delta: relativedelta = DEFAULT_DELTA,
    database: str | None = None,
) -> pd.DataFrame | None:
    """Run the ERCOT SCED shadow price scrape."""
    return run_public_report(
        CONFIG,
        start_date=start_date,
        end_date=end_date,
        delta=delta,
        database=database,
    )


if __name__ == "__main__":
    main()
