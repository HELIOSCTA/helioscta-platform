"""Orchestrate PJM unverified hourly Real-Time LMP refreshes."""

from __future__ import annotations

from collections.abc import Iterable
from datetime import datetime
from pathlib import Path
import sys
from typing import Any

from dateutil.relativedelta import relativedelta

REPO_ROOT = Path(__file__).resolve().parents[4]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from backend.scrapes.power.pjm import rt_unverified_hrl_lmps as scrape

API_SCRAPE_NAME = scrape.API_SCRAPE_NAME
DEFAULT_RUN_MODE = "scheduled_hourly"
DEFAULT_LOOKBACK_DAYS = 1
DEFAULT_LOOKAHEAD_DAYS = 0
DEFAULT_DELTA = relativedelta(days=1)
DEFAULT_METADATA = {
    "scheduler": "helios-pjm-hourly-bucket.timer",
    "schedule_reason": "hourly_pjm_bucket_refresh",
}


def main(
    start_date: datetime | None = None,
    end_date: datetime | None = None,
    delta: relativedelta = DEFAULT_DELTA,
    pnode_types: str | Iterable[str] | None = scrape.DEFAULT_PRICING_NODE_TYPES,
    database: str | None = None,
    run_mode: str = DEFAULT_RUN_MODE,
    metadata: dict[str, Any] | None = None,
):
    """Run the hourly unverified RT LMP scrape with scheduler metadata."""
    now = datetime.now()
    start_date = start_date or (now - relativedelta(days=DEFAULT_LOOKBACK_DAYS))
    end_date = end_date or (now + relativedelta(days=DEFAULT_LOOKAHEAD_DAYS))
    fetch_metadata = {
        "run_mode": run_mode,
        **DEFAULT_METADATA,
        **(metadata or {}),
    }
    return scrape.main(
        start_date=start_date,
        end_date=end_date,
        delta=delta,
        pnode_types=pnode_types,
        database=database,
        metadata=fetch_metadata,
    )


if __name__ == "__main__":
    main()
