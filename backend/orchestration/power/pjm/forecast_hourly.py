"""Orchestrate PJM hourly Data Miner forecast refreshes."""

from __future__ import annotations

from typing import Any

import pandas as pd

from backend.scrapes.power.pjm import hourly_solar_power_forecast
from backend.scrapes.power.pjm import hourly_wind_power_forecast
from backend.scrapes.power.pjm import load_frcstd_7_day


DEFAULT_FEEDS = (
    load_frcstd_7_day,
    hourly_solar_power_forecast,
    hourly_wind_power_forecast,
)


def main(
    *,
    database: str | None = None,
    run_mode: str = "scheduled",
    metadata: dict[str, Any] | None = None,
) -> dict[str, pd.DataFrame | None]:
    """Run PJM load, solar, and wind hourly forecast scrapes."""
    fetch_metadata = {"run_mode": run_mode, **(metadata or {})}
    return {
        feed.API_SCRAPE_NAME: feed.main(database=database, metadata=fetch_metadata)
        for feed in DEFAULT_FEEDS
    }


if __name__ == "__main__":
    main()
