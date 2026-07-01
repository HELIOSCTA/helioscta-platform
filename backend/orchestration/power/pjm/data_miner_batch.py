"""Run the promoted PJM Data Miner scrape modules as a scheduled batch."""

from __future__ import annotations

import importlib
import logging
import traceback
from dataclasses import dataclass
from datetime import datetime, timezone
from time import perf_counter


LOGGER = logging.getLogger(__name__)

DEFAULT_FEEDS: tuple[str, ...] = (
    "act_sch_interchange",
    "agg_definitions",
    "ancillary_services",
    "da_interface_flows_and_limits",
    "da_marginal_value",
    "day_gen_capacity",
    "dispatched_reserves",
    "five_min_solar_generation",
    "five_min_tie_flows",
    "frcstd_gen_outages",
    "hrl_load_metered",
    "hrl_load_prelim",
    "load_frcstd_hist",
    "pnode",
    "reserve_market_results",
    "rt_and_self_ecomax",
    "rt_default_mv_override",
    "rt_dispatch_reserves",
    "rt_fivemin_mnt_lmps",
    "rt_marginal_value",
    "rt_short_term_mv_override",
    "solar_gen",
    "unverified_five_min_lmps",
    "wind_gen",
)


@dataclass(frozen=True)
class FeedRunResult:
    feed_name: str
    status: str
    elapsed_seconds: float
    error: str | None = None


def _configure_logging() -> None:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s | %(levelname)-8s | %(name)s | %(message)s",
    )


def _run_feed(feed_name: str) -> FeedRunResult:
    started = perf_counter()
    try:
        module = importlib.import_module(f"backend.scrapes.power.pjm.{feed_name}")
        module.main()
    except Exception as exc:
        elapsed = perf_counter() - started
        print(f"PJM Data Miner feed failed: {feed_name}", flush=True)
        traceback.print_exc()
        return FeedRunResult(
            feed_name=feed_name,
            status="failed",
            elapsed_seconds=elapsed,
            error=str(exc),
        )

    elapsed = perf_counter() - started
    return FeedRunResult(feed_name=feed_name, status="succeeded", elapsed_seconds=elapsed)


def main(feed_names: tuple[str, ...] = DEFAULT_FEEDS) -> int:
    _configure_logging()
    batch_started = datetime.now(timezone.utc)
    print(
        "Starting PJM Data Miner batch at "
        f"{batch_started.isoformat()} with {len(feed_names)} feeds",
        flush=True,
    )

    results = [_run_feed(feed_name) for feed_name in feed_names]
    failures = [result for result in results if result.status != "succeeded"]
    succeeded = len(results) - len(failures)

    for result in results:
        if result.status == "succeeded":
            print(
                "PJM Data Miner feed succeeded: "
                f"{result.feed_name} in {result.elapsed_seconds:.1f}s",
                flush=True,
            )
        else:
            print(
                "PJM Data Miner feed failed: "
                f"{result.feed_name} in {result.elapsed_seconds:.1f}s: {result.error}",
                flush=True,
            )

    print(
        f"Completed PJM Data Miner batch: {succeeded} succeeded, {len(failures)} failed",
        flush=True,
    )
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
