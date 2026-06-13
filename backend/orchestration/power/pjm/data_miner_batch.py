"""Run the promoted PJM Data Miner scrape modules as a scheduled batch."""

from __future__ import annotations

import importlib
import logging
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
    "da_transconstraints",
    "day_gen_capacity",
    "dispatched_reserves",
    "five_min_solar_generation",
    "five_min_tie_flows",
    "frcstd_gen_outages",
    "gen_outages_by_type",
    "hrl_dmd_bids",
    "hrl_load_metered",
    "hrl_load_prelim",
    "load_frcstd_7_day",
    "load_frcstd_hist",
    "pnode",
    "reserve_market_results",
    "rt_default_mv_override",
    "rt_dispatch_reserves",
    "rt_fivemin_hrl_lmps",
    "rt_fivemin_mnt_lmps",
    "rt_hrl_lmps",
    "rt_marginal_value",
    "rt_short_term_mv_override",
    "rt_unverified_hrl_lmps",
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
        LOGGER.exception("PJM Data Miner feed failed: %s", feed_name)
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
    LOGGER.info(
        "Starting PJM Data Miner batch at %s with %s feeds",
        batch_started.isoformat(),
        len(feed_names),
    )

    results = [_run_feed(feed_name) for feed_name in feed_names]
    failures = [result for result in results if result.status != "succeeded"]
    succeeded = len(results) - len(failures)

    for result in results:
        if result.status == "succeeded":
            LOGGER.info(
                "PJM Data Miner feed succeeded: %s in %.1fs",
                result.feed_name,
                result.elapsed_seconds,
            )
        else:
            LOGGER.error(
                "PJM Data Miner feed failed: %s in %.1fs: %s",
                result.feed_name,
                result.elapsed_seconds,
                result.error,
            )

    LOGGER.info(
        "Completed PJM Data Miner batch: %s succeeded, %s failed",
        succeeded,
        len(failures),
    )
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
