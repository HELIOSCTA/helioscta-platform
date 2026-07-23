"""Orchestrate PJM eDART transmission outage raw TXT refreshes."""

from __future__ import annotations

from typing import Any

import pandas as pd

from backend.scrapes.power.pjm import transmission_outages as scrape


API_SCRAPE_NAME = scrape.API_SCRAPE_NAME
TARGET_TABLE = scrape.TARGET_TABLE
TARGET_TABLE_FQN = scrape.TARGET_TABLE_FQN


def main(
    *,
    database: str | None = None,
    retention_days: int = scrape.DEFAULT_RETENTION_DAYS,
    run_mode: str = "scheduled",
    validate_after_write: bool = True,
    metadata: dict[str, Any] | None = None,
) -> pd.DataFrame:
    """Run the raw transmission-outage scrape with orchestration metadata."""
    fetch_metadata = {"run_mode": run_mode, **(metadata or {})}
    return scrape.main(
        database=database,
        retention_days=retention_days,
        validate_after_write=validate_after_write,
        metadata=fetch_metadata,
    )


if __name__ == "__main__":
    main()
