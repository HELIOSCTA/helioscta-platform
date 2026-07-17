"""Run promoted ERCOT real-time price adder scrape modules."""

from __future__ import annotations

import importlib
import logging
import traceback
from dataclasses import dataclass
from datetime import datetime, timedelta
from time import perf_counter
from zoneinfo import ZoneInfo


LOGGER = logging.getLogger(__name__)

DEFAULT_FEEDS: tuple[str, ...] = (
    "rt_price_adders_sced",
    "rt_price_adders_15min",
)
LOCAL_MARKET_TIMEZONE = "America/Chicago"
DEFAULT_LOOKBACK_DAYS = 1


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


def _default_market_datetime() -> datetime:
    market_now = datetime.now(ZoneInfo(LOCAL_MARKET_TIMEZONE))
    return (market_now - timedelta(days=DEFAULT_LOOKBACK_DAYS)).replace(tzinfo=None)


def _run_feed(feed_name: str, business_datetime: datetime) -> FeedRunResult:
    started = perf_counter()
    try:
        module = importlib.import_module(f"backend.scrapes.power.ercot.{feed_name}")
        module.main(start_date=business_datetime, end_date=business_datetime)
    except Exception as exc:
        elapsed = perf_counter() - started
        print(f"ERCOT price adder feed failed: {feed_name}", flush=True)
        traceback.print_exc()
        return FeedRunResult(
            feed_name=feed_name,
            status="failed",
            elapsed_seconds=elapsed,
            error=str(exc),
        )

    elapsed = perf_counter() - started
    return FeedRunResult(feed_name=feed_name, status="succeeded", elapsed_seconds=elapsed)


def main(
    feed_names: tuple[str, ...] = DEFAULT_FEEDS,
    business_datetime: datetime | None = None,
) -> int:
    """Run the promoted ERCOT real-time price adder feeds."""
    _configure_logging()
    business_datetime = business_datetime or _default_market_datetime()
    print(
        "Starting ERCOT price adder batch for "
        f"{business_datetime:%Y-%m-%d} with {len(feed_names)} feeds",
        flush=True,
    )

    results = [_run_feed(feed_name, business_datetime) for feed_name in feed_names]
    failures = [result for result in results if result.status != "succeeded"]
    succeeded = len(results) - len(failures)

    for result in results:
        if result.status == "succeeded":
            print(
                "ERCOT price adder feed succeeded: "
                f"{result.feed_name} in {result.elapsed_seconds:.1f}s",
                flush=True,
            )
        else:
            print(
                "ERCOT price adder feed failed: "
                f"{result.feed_name} in {result.elapsed_seconds:.1f}s: {result.error}",
                flush=True,
            )

    print(
        "Completed ERCOT price adder batch: "
        f"{succeeded} succeeded, {len(failures)} failed",
        flush=True,
    )
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
