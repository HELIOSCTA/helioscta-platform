"""Orchestrate PJM Operations Summary Data Miner refreshes."""

from __future__ import annotations

import logging
import traceback
from dataclasses import dataclass
from datetime import datetime, timezone
from time import perf_counter
from types import ModuleType
from typing import Any

from backend.scrapes.power.pjm import ops_sum_frcst_peak_area
from backend.scrapes.power.pjm import ops_sum_frcst_peak_rto
from backend.scrapes.power.pjm import ops_sum_frcstd_tran_lim
from backend.scrapes.power.pjm import ops_sum_prev_period
from backend.scrapes.power.pjm import ops_sum_prjctd_tie_flow


LOGGER = logging.getLogger(__name__)

DEFAULT_FEEDS: tuple[ModuleType, ...] = (
    ops_sum_frcstd_tran_lim,
    ops_sum_frcst_peak_area,
    ops_sum_frcst_peak_rto,
    ops_sum_prev_period,
    ops_sum_prjctd_tie_flow,
)


@dataclass(frozen=True)
class OpsSumRunResult:
    feed_name: str
    status: str
    elapsed_seconds: float
    error: str | None = None


def _configure_logging() -> None:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s | %(levelname)-8s | %(name)s | %(message)s",
    )


def _run_feed(
    feed: ModuleType,
    *,
    database: str | None,
    metadata: dict[str, Any],
) -> OpsSumRunResult:
    started = perf_counter()
    feed_name = str(feed.API_SCRAPE_NAME)
    try:
        feed.main(database=database, metadata=metadata)
    except Exception as exc:
        elapsed = perf_counter() - started
        print(f"PJM Ops Sum feed failed: {feed_name}", flush=True)
        traceback.print_exc()
        return OpsSumRunResult(
            feed_name=feed_name,
            status="failed",
            elapsed_seconds=elapsed,
            error=str(exc),
        )

    elapsed = perf_counter() - started
    return OpsSumRunResult(
        feed_name=feed_name,
        status="succeeded",
        elapsed_seconds=elapsed,
    )


def main(
    feeds: tuple[ModuleType, ...] = DEFAULT_FEEDS,
    *,
    database: str | None = None,
    run_mode: str = "scheduled",
    metadata: dict[str, Any] | None = None,
) -> int:
    """Run the daily PJM Operations Summary scrape batch."""
    _configure_logging()
    batch_started = datetime.now(timezone.utc)
    fetch_metadata = {"run_mode": run_mode, **(metadata or {})}
    print(
        "Starting PJM Ops Sum batch at "
        f"{batch_started.isoformat()} with {len(feeds)} feeds",
        flush=True,
    )

    results = [
        _run_feed(feed, database=database, metadata=fetch_metadata)
        for feed in feeds
    ]
    failures = [result for result in results if result.status != "succeeded"]
    succeeded = len(results) - len(failures)

    for result in results:
        if result.status == "succeeded":
            print(
                "PJM Ops Sum feed succeeded: "
                f"{result.feed_name} in {result.elapsed_seconds:.1f}s",
                flush=True,
            )
        else:
            print(
                "PJM Ops Sum feed failed: "
                f"{result.feed_name} in {result.elapsed_seconds:.1f}s: "
                f"{result.error}",
                flush=True,
            )

    print(
        f"Completed PJM Ops Sum batch: {succeeded} succeeded, "
        f"{len(failures)} failed",
        flush=True,
    )
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
