"""Run promoted PJM hourly scrape workflows as a scheduled bucket."""

from __future__ import annotations

import importlib
import inspect
import logging
import traceback
from dataclasses import dataclass, field
from datetime import datetime, timezone
from time import perf_counter
from typing import Any


LOGGER = logging.getLogger(__name__)

DEFAULT_RUN_MODE = "scheduled_hourly"
DEFAULT_BUCKET_NAME = "pjm_hourly_bucket"
DEFAULT_METADATA = {
    "bucket": DEFAULT_BUCKET_NAME,
    "scheduler": "helios-pjm-hourly-bucket.timer",
    "schedule_reason": "hourly_pjm_bucket_refresh",
}


@dataclass(frozen=True)
class HourlyFeed:
    name: str
    module_path: str
    kwargs: dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class FeedRunResult:
    feed_name: str
    status: str
    elapsed_seconds: float
    error: str | None = None


DEFAULT_FEEDS: tuple[HourlyFeed, ...] = (
    HourlyFeed(
        name="rt_unverified_hrl_lmps",
        module_path="backend.orchestration.power.pjm.rt_unverified_hrl_lmps",
    ),
)


def _configure_logging() -> None:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s | %(levelname)-8s | %(name)s | %(message)s",
    )


def _call_main(
    feed: HourlyFeed,
    *,
    database: str | None,
    run_mode: str,
    metadata: dict[str, Any],
) -> object:
    module = importlib.import_module(feed.module_path)
    main = module.main
    signature = inspect.signature(main)
    supports_kwargs = any(
        parameter.kind == inspect.Parameter.VAR_KEYWORD
        for parameter in signature.parameters.values()
    )
    kwargs = dict(feed.kwargs)

    if supports_kwargs or "database" in signature.parameters:
        kwargs["database"] = database
    if supports_kwargs or "run_mode" in signature.parameters:
        kwargs["run_mode"] = run_mode
    if supports_kwargs or "metadata" in signature.parameters:
        kwargs["metadata"] = {
            **DEFAULT_METADATA,
            "bucket_feed": feed.name,
            **metadata,
        }

    return main(**kwargs)


def _run_feed(
    feed: HourlyFeed,
    *,
    database: str | None,
    run_mode: str,
    metadata: dict[str, Any],
) -> FeedRunResult:
    started = perf_counter()
    try:
        _call_main(feed, database=database, run_mode=run_mode, metadata=metadata)
    except Exception as exc:
        elapsed = perf_counter() - started
        print(f"PJM hourly bucket feed failed: {feed.name}", flush=True)
        traceback.print_exc()
        return FeedRunResult(
            feed_name=feed.name,
            status="failed",
            elapsed_seconds=elapsed,
            error=str(exc),
        )

    elapsed = perf_counter() - started
    return FeedRunResult(feed_name=feed.name, status="succeeded", elapsed_seconds=elapsed)


def main(
    feeds: tuple[HourlyFeed, ...] = DEFAULT_FEEDS,
    *,
    database: str | None = None,
    run_mode: str = DEFAULT_RUN_MODE,
    metadata: dict[str, Any] | None = None,
) -> int:
    """Run the PJM hourly scrape bucket and fail if any feed fails."""
    _configure_logging()
    bucket_metadata = metadata or {}
    bucket_started = datetime.now(timezone.utc)
    print(
        "Starting PJM hourly bucket at "
        f"{bucket_started.isoformat()} with {len(feeds)} feeds",
        flush=True,
    )

    results = [
        _run_feed(
            feed,
            database=database,
            run_mode=run_mode,
            metadata=bucket_metadata,
        )
        for feed in feeds
    ]
    failures = [result for result in results if result.status != "succeeded"]
    succeeded = len(results) - len(failures)

    for result in results:
        if result.status == "succeeded":
            print(
                "PJM hourly bucket feed succeeded: "
                f"{result.feed_name} in {result.elapsed_seconds:.1f}s",
                flush=True,
            )
        else:
            print(
                "PJM hourly bucket feed failed: "
                f"{result.feed_name} in {result.elapsed_seconds:.1f}s: {result.error}",
                flush=True,
            )

    print(
        f"Completed PJM hourly bucket: {succeeded} succeeded, {len(failures)} failed",
        flush=True,
    )
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
