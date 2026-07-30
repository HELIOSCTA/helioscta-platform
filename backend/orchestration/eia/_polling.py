"""Release polling helpers for EIA orchestration modules."""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
import time
from typing import Any
from urllib.parse import urlsplit

import pandas as pd

from backend.scrapes.eia import client
from backend.utils.ops_logging import log_api_fetch, redact_secrets


class DataNotYetAvailable(RuntimeError):
    """Raised when the EIA API has not published the target period yet."""


@dataclass(frozen=True)
class AvailabilityResult:
    is_available: bool
    message: str
    metadata: dict[str, Any]


def poll_until_available(
    *,
    pipeline_name: str,
    route: str,
    target_table: str,
    run_id: str | None,
    database: str | None,
    metadata: dict[str, Any],
    fetch_once: Callable[[int], pd.DataFrame],
    check_available: Callable[[pd.DataFrame], AvailabilityResult],
    poll_ceiling_seconds: int,
    poll_wait_seconds: int,
    sleep_fn: Callable[[float], None] = time.sleep,
) -> pd.DataFrame:
    """Poll an EIA source until the target period is present or the window ends."""
    if poll_ceiling_seconds < 1:
        raise ValueError("poll_ceiling_seconds must be at least 1.")
    if poll_wait_seconds < 0:
        raise ValueError("poll_wait_seconds cannot be negative.")

    parsed_url = urlsplit(f"{client.BASE_URL.rstrip('/')}/{route.strip('/')}/data/")
    started = time.perf_counter()
    poll_count = 0
    last_result = AvailabilityResult(
        is_available=False,
        message="poll did not run",
        metadata={},
    )

    while True:
        poll_count += 1
        df = fetch_once(poll_count)
        last_result = check_available(df)
        elapsed_seconds = time.perf_counter() - started

        if last_result.is_available:
            _log_poll_result(
                pipeline_name=pipeline_name,
                target_table=target_table,
                parsed_url=parsed_url,
                run_id=run_id,
                database=database,
                status="success",
                elapsed_seconds=elapsed_seconds,
                poll_count=poll_count,
                rows_returned=len(df),
                metadata={**metadata, **last_result.metadata},
            )
            return df

        if elapsed_seconds >= poll_ceiling_seconds:
            _log_poll_result(
                pipeline_name=pipeline_name,
                target_table=target_table,
                parsed_url=parsed_url,
                run_id=run_id,
                database=database,
                status="failure",
                elapsed_seconds=elapsed_seconds,
                poll_count=poll_count,
                rows_returned=len(df),
                error_type=DataNotYetAvailable.__name__,
                error_message=last_result.message,
                metadata={**metadata, **last_result.metadata},
            )
            raise DataNotYetAvailable(last_result.message)

        sleep_seconds = min(
            float(poll_wait_seconds),
            poll_ceiling_seconds - elapsed_seconds,
        )
        if sleep_seconds > 0:
            sleep_fn(sleep_seconds)


def _log_poll_result(
    *,
    pipeline_name: str,
    target_table: str,
    parsed_url,
    run_id: str | None,
    database: str | None,
    status: str,
    elapsed_seconds: float,
    poll_count: int,
    metadata: dict[str, Any],
    rows_returned: int | None = None,
    error_type: str | None = None,
    error_message: str | None = None,
) -> None:
    log_api_fetch(
        actor_type="scrape",
        provider="eia",
        pipeline_name=pipeline_name,
        run_id=run_id,
        operation_name=f"{pipeline_name}_poll",
        feed_name=pipeline_name,
        target_table=target_table,
        method="GET",
        target_host=parsed_url.netloc,
        target_path=parsed_url.path,
        status=status,
        http_status=200 if status == "success" else None,
        attempt=poll_count,
        max_attempts=poll_count,
        elapsed_ms=round(elapsed_seconds * 1000),
        rows_returned=rows_returned,
        error_type=error_type,
        error_message=redact_secrets(error_message),
        metadata={
            **metadata,
            "poll_count": poll_count,
            "poll_seconds": round(elapsed_seconds, 1),
        },
        database=database,
    )
