"""Orchestrate PJM seven-day load forecast refreshes."""

from __future__ import annotations

from typing import Any

import pandas as pd

from backend.scrapes.power.pjm import load_frcstd_7_day as scrape


API_SCRAPE_NAME = scrape.API_SCRAPE_NAME
TARGET_TABLE = scrape.TARGET_TABLE
TARGET_TABLE_FQN = scrape.TARGET_TABLE_FQN


def main(
    *,
    database: str | None = None,
    run_mode: str = "scheduled",
    metadata: dict[str, Any] | None = None,
) -> pd.DataFrame | None:
    """Run the current PJM seven-day load forecast snapshot scrape."""
    fetch_metadata = {"run_mode": run_mode, **(metadata or {})}
    return scrape.main(database=database, metadata=fetch_metadata)


if __name__ == "__main__":
    main()
