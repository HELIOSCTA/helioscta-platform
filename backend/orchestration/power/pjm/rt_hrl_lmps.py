"""Orchestrate PJM verified hourly Real-Time LMPs after source publication."""

from __future__ import annotations

from pathlib import Path
import sys
from typing import Any

REPO_ROOT = Path(__file__).resolve().parents[4]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from backend.scrapes.power.pjm import rt_hrl_lmps as scrape

DEFAULT_RUN_MODE = "scheduled_post_publish"
DEFAULT_METADATA = {
    "scheduler": "helios-pjm-rt-hrl-lmps.timer",
    "schedule_reason": "post_pjm_verified_rt_hourly_lmp_publication_window",
}


def main(
    database: str | None = None,
    run_mode: str = DEFAULT_RUN_MODE,
    metadata: dict[str, Any] | None = None,
) -> int:
    """Run the verified hourly RT LMP scrape with post-publish metadata."""
    fetch_metadata = {**DEFAULT_METADATA, **(metadata or {})}
    scrape.main(database=database, run_mode=run_mode, metadata=fetch_metadata)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
