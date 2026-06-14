"""Shared utilities for ISO-NE ISO Express CSV scraping."""
from __future__ import annotations

from io import StringIO
import time
from urllib.parse import urlsplit

import pandas as pd
import requests

from backend.utils.ops_logging import log_api_fetch, redact_secrets


ISONE_BASE_URL = "https://www.iso-ne.com"
COOKIE_WARMUP_URL = (
    f"{ISONE_BASE_URL}/isoexpress/web/reports/operations/-/tree/gen-fuel-mix"
)
REQUEST_DELAY_SECONDS = 1.0
REQUEST_TIMEOUT_SECONDS = 60


def make_request(
    url: str,
    logger=None,
    retries: int = 3,
    timeout_seconds: int = REQUEST_TIMEOUT_SECONDS,
    *,
    pipeline_name: str | None = None,
    run_id: str | None = None,
    feed_name: str | None = None,
    target_table: str | None = None,
    operation_name: str | None = None,
    metadata: dict | None = None,
    database: str | None = None,
) -> requests.Response:
    """Make a CSV request to ISO-NE with cookie warmup, retries, and telemetry."""
    parsed_url = urlsplit(url)
    operation = operation_name or parsed_url.path.rsplit("/", 1)[-1] or parsed_url.path
    last_error = None

    for attempt in range(1, retries + 1):
        request_started_at = time.perf_counter()
        try:
            with requests.Session() as session:
                session.get(COOKIE_WARMUP_URL, timeout=timeout_seconds)
                response = session.get(url, timeout=timeout_seconds)
                elapsed_ms = round((time.perf_counter() - request_started_at) * 1000)
                content_type = response.headers.get("Content-Type", "")

                if logger:
                    logger.info(f"Pulling from ... {url}")
                    logger.info(
                        f"Status Code: {response.status_code} ... "
                        f"Content Type: {content_type}"
                    )

                if response.status_code == 200 and "text/csv" in content_type:
                    _log_fetch_attempt(
                        parsed_url=parsed_url,
                        pipeline_name=pipeline_name,
                        run_id=run_id,
                        operation_name=operation,
                        feed_name=feed_name,
                        target_table=target_table,
                        status="success",
                        http_status=response.status_code,
                        elapsed_ms=elapsed_ms,
                        attempt=attempt,
                        max_attempts=retries,
                        rows_returned=_rows_returned_from_response(response),
                        metadata=metadata,
                        database=database,
                    )
                    time.sleep(REQUEST_DELAY_SECONDS)
                    return response

                last_error = (
                    f"status={response.status_code}, content_type={content_type}"
                )
                _log_fetch_attempt(
                    parsed_url=parsed_url,
                    pipeline_name=pipeline_name,
                    run_id=run_id,
                    operation_name=operation,
                    feed_name=feed_name,
                    target_table=target_table,
                    status="failure",
                    http_status=response.status_code,
                    elapsed_ms=elapsed_ms,
                    attempt=attempt,
                    max_attempts=retries,
                    error_type="UnexpectedResponse",
                    error_message=last_error,
                    metadata=metadata,
                    database=database,
                )
        except requests.exceptions.RequestException as exc:
            elapsed_ms = round((time.perf_counter() - request_started_at) * 1000)
            last_error = str(exc)
            _log_fetch_attempt(
                parsed_url=parsed_url,
                pipeline_name=pipeline_name,
                run_id=run_id,
                operation_name=operation,
                feed_name=feed_name,
                target_table=target_table,
                status="failure",
                http_status=None,
                elapsed_ms=elapsed_ms,
                attempt=attempt,
                max_attempts=retries,
                error_type=type(exc).__name__,
                error_message=redact_secrets(last_error),
                metadata=metadata,
                database=database,
            )
            if logger:
                logger.warning(f"Attempt {attempt}/{retries} failed: {exc}")

        time.sleep(REQUEST_DELAY_SECONDS)

    raise RuntimeError(
        f"Failed to get data from {url} after {retries} attempts ({last_error})"
    )


def parse_csv_response(
    response: requests.Response,
    skiprows: list[int] | None = None,
    skipfooter: int = 1,
) -> pd.DataFrame:
    """Parse an ISO-NE CSV response into a DataFrame."""
    if skiprows is None:
        skiprows = [0, 1, 2, 3, 5]

    content = response.content.decode("utf8").strip()
    if not content:
        raise RuntimeError("ISO-NE CSV response was empty")
    if content.lower().startswith("no data exists"):
        raise RuntimeError(content)

    try:
        return pd.read_csv(
            StringIO(content),
            skiprows=skiprows,
            skipfooter=skipfooter,
            engine="python",
        )
    except pd.errors.EmptyDataError as exc:
        raise RuntimeError("ISO-NE CSV response did not contain tabular data") from exc


def _log_fetch_attempt(
    *,
    parsed_url,
    pipeline_name: str | None,
    run_id: str | None,
    operation_name: str,
    feed_name: str | None,
    target_table: str | None,
    status: str,
    http_status: int | None,
    elapsed_ms: int,
    attempt: int,
    max_attempts: int,
    rows_returned: int | None = None,
    error_type: str | None = None,
    error_message: str | None = None,
    metadata: dict | None = None,
    database: str | None = None,
) -> None:
    log_api_fetch(
        actor_type="scrape",
        provider="isone",
        pipeline_name=pipeline_name,
        run_id=run_id,
        operation_name=operation_name,
        feed_name=feed_name,
        target_table=target_table,
        method="GET",
        target_host=parsed_url.netloc,
        target_path=parsed_url.path,
        status=status,
        http_status=http_status,
        attempt=attempt,
        max_attempts=max_attempts,
        elapsed_ms=elapsed_ms,
        rows_returned=rows_returned,
        error_type=error_type,
        error_message=redact_secrets(error_message),
        metadata=metadata,
        database=database,
    )


def _rows_returned_from_response(response: requests.Response) -> int | None:
    try:
        text = response.content.decode("utf8")
    except UnicodeDecodeError:
        return None
    line_count = sum(1 for line in text.splitlines() if line.strip())
    return line_count or None
