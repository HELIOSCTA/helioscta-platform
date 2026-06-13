"""Run promoted ERCOT congestion scrape modules as a scheduled support batch."""

from __future__ import annotations

import importlib
import logging
import traceback
from dataclasses import dataclass
from datetime import datetime, timezone
from time import perf_counter


LOGGER = logging.getLogger(__name__)

DEFAULT_FEEDS: tuple[str, ...] = (
    "dam_shadow_prices",
    "sced_shadow_prices",
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
        module = importlib.import_module(f"backend.scrapes.power.ercot.{feed_name}")
        module.main()
    except Exception as exc:
        elapsed = perf_counter() - started
        print(f"ERCOT congestion feed failed: {feed_name}", flush=True)
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
    """Run the promoted ERCOT congestion feeds and return nonzero on failure."""
    _configure_logging()
    batch_started = datetime.now(timezone.utc)
    print(
        "Starting ERCOT congestion batch at "
        f"{batch_started.isoformat()} with {len(feed_names)} feeds",
        flush=True,
    )

    results = [_run_feed(feed_name) for feed_name in feed_names]
    failures = [result for result in results if result.status != "succeeded"]
    succeeded = len(results) - len(failures)

    for result in results:
        if result.status == "succeeded":
            print(
                "ERCOT congestion feed succeeded: "
                f"{result.feed_name} in {result.elapsed_seconds:.1f}s",
                flush=True,
            )
        else:
            print(
                "ERCOT congestion feed failed: "
                f"{result.feed_name} in {result.elapsed_seconds:.1f}s: {result.error}",
                flush=True,
            )

    print(
        "Completed ERCOT congestion batch: "
        f"{succeeded} succeeded, {len(failures)} failed",
        flush=True,
    )
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
