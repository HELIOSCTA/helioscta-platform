"""Run promoted ERCOT renewable production scrape modules."""

from __future__ import annotations

import importlib
import logging
import traceback
from dataclasses import dataclass
from datetime import datetime, timezone
from time import perf_counter

from dateutil.relativedelta import relativedelta


LOGGER = logging.getLogger(__name__)

DEFAULT_FEEDS: tuple[str, ...] = (
    "wind_power_production_hourly",
    "solar_power_production_hourly",
)
DEFAULT_LOOKBACK_DAYS = 1
DEFAULT_LOOKAHEAD_DAYS = 7


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


def _run_feed(
    feed_name: str,
    *,
    start_date: datetime,
    end_date: datetime,
) -> FeedRunResult:
    started = perf_counter()
    try:
        module = importlib.import_module(f"backend.scrapes.power.ercot.{feed_name}")
        module.main(start_date=start_date, end_date=end_date)
    except Exception as exc:
        elapsed = perf_counter() - started
        print(f"ERCOT renewables feed failed: {feed_name}", flush=True)
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
    start_date: datetime | None = None,
    end_date: datetime | None = None,
) -> int:
    """Run promoted ERCOT renewable feeds and return nonzero on failure."""
    _configure_logging()
    now = datetime.now()
    start_date = start_date or (now + relativedelta(days=-DEFAULT_LOOKBACK_DAYS))
    end_date = end_date or (now + relativedelta(days=DEFAULT_LOOKAHEAD_DAYS))
    batch_started = datetime.now(timezone.utc)
    print(
        "Starting ERCOT renewables batch at "
        f"{batch_started.isoformat()} with {len(feed_names)} feeds; "
        f"window={start_date:%Y-%m-%d} to {end_date:%Y-%m-%d}",
        flush=True,
    )

    results = [
        _run_feed(feed_name, start_date=start_date, end_date=end_date)
        for feed_name in feed_names
    ]
    failures = [result for result in results if result.status != "succeeded"]
    succeeded = len(results) - len(failures)

    for result in results:
        if result.status == "succeeded":
            print(
                "ERCOT renewables feed succeeded: "
                f"{result.feed_name} in {result.elapsed_seconds:.1f}s",
                flush=True,
            )
        else:
            print(
                "ERCOT renewables feed failed: "
                f"{result.feed_name} in {result.elapsed_seconds:.1f}s: {result.error}",
                flush=True,
            )

    print(
        "Completed ERCOT renewables batch: "
        f"{succeeded} succeeded, {len(failures)} failed",
        flush=True,
    )
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
