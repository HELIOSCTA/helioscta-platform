"""ERCOT Real-Time Price Adders by SCED Interval.

Source definition:
https://www.ercot.com/mp/data-products/data-product-details?id=NP6-323-CD

Feed metadata reviewed from ERCOT EMIL and Public Reports API on 2026-07-17:
- Feed short name: rt_price_adders_sced
- EMIL ID: NP6-323-CD
- Report Type ID: 13221
- Display name: Real-Time Price Adders by SCED Interval
- Posting frequency: Event - Per SCED Run
- Audience: Public
- Channel: Public, EWS
"""

from __future__ import annotations

from datetime import datetime

import pandas as pd
from dateutil.relativedelta import relativedelta

from backend.scrapes.power.ercot.feed_configs import FEED_CONFIGS
from backend.scrapes.power.ercot.public_report_feed import run_public_report


CONFIG = FEED_CONFIGS["rt_price_adders_sced"]
API_SCRAPE_NAME = CONFIG.feed_name
DEFAULT_DELTA = relativedelta(days=1)


def main(
    start_date: datetime | None = None,
    end_date: datetime | None = None,
    delta: relativedelta = DEFAULT_DELTA,
    database: str | None = None,
    metadata: dict | None = None,
) -> pd.DataFrame | None:
    """Run the ERCOT real-time SCED price adder scrape."""
    return run_public_report(
        CONFIG,
        start_date=start_date,
        end_date=end_date,
        delta=delta,
        database=database,
        metadata=metadata,
    )


if __name__ == "__main__":
    main()
