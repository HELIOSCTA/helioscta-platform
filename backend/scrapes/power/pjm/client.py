"""PJM Data Miner API client.

Source definition:
https://dataminer2.pjm.com/feeds

Single sanctioned entry point for PJM Data Miner v1 GET requests. Centralizes
the shared host, the ``subscription-key`` auth, bounded retry/backoff, and page
iteration without tying standalone scrapes to ops telemetry tables.

Feed metadata reviewed on 2026-06-03:
- Provider: PJM Data Miner 2 public API.
- Host: https://api.pjm.com/api/v1/
- Authentication: a ``subscription-key`` query parameter (PJM_API_KEY).
- Response formats: ``format=csv`` is the HeliosCTA default; ``format=json``
  is also supported by PJM.
- Pagination: ``rowCount`` (page size) + ``startRow`` (1-based offset). A
  request that asks for one ``rowCount`` page returns at most that many rows,
  so callers must iterate ``startRow`` to read a result set larger than one
  page. ``fetch_csv`` does this; the bare ``make_get_request`` does not.
- Credential environment variable: PJM_API_KEY via backend.credentials.
"""

from __future__ import annotations

import logging
import time
from io import BytesIO
from urllib.parse import urlsplit

import pandas as pd
import requests

from backend import credentials
from backend.utils.ops_logging import log_api_fetch


logger = logging.getLogger(__name__)

BASE_URL = "https://api.pjm.com/api/v1/"
DEFAULT_TIMEOUT_SECONDS = 60
DEFAULT_PAGE_SIZE = 50000
# Safety cap so a runaway result set or a never-shrinking page can't loop
# forever. 200 * 50k = 10M rows; hitting it is logged, never silent.
DEFAULT_MAX_PAGES = 200
DEFAULT_MAX_ATTEMPTS = 3
DEFAULT_RETRY_DELAY_SECONDS = 5
# Transient statuses worth retrying. 4xx (other than 429) are caller errors
# and are raised immediately without retry.
RETRYABLE_STATUS_CODES = {429, 500, 502, 503, 504}


def make_get_request(
    feed: str,
    params: dict | None = None,
    *,
    pipeline_name: str | None = None,
    run_id: str | None = None,
    feed_name: str | None = None,
    target_table: str | None = None,
    operation_name: str | None = None,
    database: str | None = None,
    log_fetch: bool = False,
    timeout: int = DEFAULT_TIMEOUT_SECONDS,
    max_attempts: int = DEFAULT_MAX_ATTEMPTS,
    retry_delay_seconds: int = DEFAULT_RETRY_DELAY_SECONDS,
    metadata: dict | None = None,
) -> requests.Response:
    """Make a single authenticated PJM Data Miner GET request.

    Injects the ``subscription-key`` auth, retries transient failures
    (connection errors, timeouts, and ``RETRYABLE_STATUS_CODES``) with a delay
    that honours any ``Retry-After`` header, raises on a non-retryable or
    final-attempt error. When ``log_fetch`` is true, writes one
    ``ops.api_fetch_log`` row per attempt. The decoded body is left to the
    caller; use ``fetch_csv`` when the result set may span more than one page.
    """
    if not credentials.PJM_API_KEY:
        raise RuntimeError(
            "Missing PJM credentials. Configure PJM_API_KEY in backend/.env."
        )

    query_params = {"subscription-key": credentials.PJM_API_KEY}
    if params:
        query_params.update(params)

    url = f"{BASE_URL}{feed}"
    parsed_url = urlsplit(url)
    operation = operation_name or feed

    def _emit(
        *,
        status: str,
        http_status: int | None,
        elapsed_ms: int,
        attempt: int,
        rows_returned: int | None = None,
        error_type: str | None = None,
        error_message: str | None = None,
    ) -> None:
        if not log_fetch:
            return
        log_api_fetch(
            actor_type="scrape",
            provider="pjm",
            pipeline_name=pipeline_name,
            run_id=run_id,
            operation_name=operation,
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
            error_message=error_message,
            metadata=metadata,
            database=database,
        )

    for attempt in range(1, max_attempts + 1):
        request_started_at = time.perf_counter()
        response: requests.Response | None = None
        try:
            response = requests.get(url, params=query_params, timeout=timeout)
            elapsed_ms = round((time.perf_counter() - request_started_at) * 1000)

            if (
                response.status_code in RETRYABLE_STATUS_CODES
                and attempt < max_attempts
            ):
                delay = _retry_delay(response, retry_delay_seconds)
                _emit(
                    status="failure",
                    http_status=response.status_code,
                    elapsed_ms=elapsed_ms,
                    attempt=attempt,
                    error_type="RetryableStatus",
                    error_message=f"HTTP {response.status_code}; retrying in {delay}s",
                )
                logger.warning(
                    "PJM %s returned HTTP %s (attempt %s/%s); retrying in %ss",
                    feed,
                    response.status_code,
                    attempt,
                    max_attempts,
                    delay,
                )
                time.sleep(delay)
                continue

            response.raise_for_status()
            _emit(
                status="success",
                http_status=response.status_code,
                elapsed_ms=elapsed_ms,
                attempt=attempt,
                rows_returned=_rows_returned_from_response(response),
            )
            return response

        except requests.RequestException as exc:
            elapsed_ms = round((time.perf_counter() - request_started_at) * 1000)
            http_status = response.status_code if response is not None else None
            _emit(
                status="failure",
                http_status=http_status,
                elapsed_ms=elapsed_ms,
                attempt=attempt,
                error_type=type(exc).__name__,
                error_message=str(exc),
            )
            is_retryable = isinstance(exc, (requests.ConnectionError, requests.Timeout))
            if is_retryable and attempt < max_attempts:
                logger.warning(
                    "PJM %s request failed (%s) on attempt %s/%s; retrying in %ss",
                    feed,
                    type(exc).__name__,
                    attempt,
                    max_attempts,
                    retry_delay_seconds,
                )
                time.sleep(retry_delay_seconds)
                continue
            raise

    raise RuntimeError(
        f"PJM request to {feed} exhausted {max_attempts} attempts without success."
    )


def fetch_csv(
    feed: str,
    params: dict | None = None,
    *,
    page_size: int = DEFAULT_PAGE_SIZE,
    max_pages: int = DEFAULT_MAX_PAGES,
    pipeline_name: str | None = None,
    run_id: str | None = None,
    feed_name: str | None = None,
    target_table: str | None = None,
    operation_name: str | None = None,
    database: str | None = None,
    log_fetch: bool = False,
    timeout: int = DEFAULT_TIMEOUT_SECONDS,
    max_attempts: int = DEFAULT_MAX_ATTEMPTS,
    retry_delay_seconds: int = DEFAULT_RETRY_DELAY_SECONDS,
    metadata: dict | None = None,
) -> pd.DataFrame:
    """Fetch a full CSV result set from PJM, iterating pages until exhausted.

    Forces ``format=csv`` and walks ``startRow`` in ``page_size`` steps until a
    page comes back shorter than ``page_size`` (the last page) or empty. Each
    HTTP page is a separate ``make_get_request`` call, so each gets its own
    retry handling. When ``log_fetch`` is true, each HTTP page gets an
    ``ops.api_fetch_log`` row with the page index in metadata. Column names are
    stripped of non-ASCII bytes (e.g. the UTF-8 BOM PJM prefixes the first
    header). Returns the concatenated DataFrame, or an empty DataFrame when the
    feed returns no rows.
    """
    base_params = dict(params or {})
    base_params["format"] = "csv"

    frames: list[pd.DataFrame] = []
    start_row = 1
    truncated = True
    for page in range(1, max_pages + 1):
        page_params = {**base_params, "rowCount": page_size, "startRow": start_row}
        request_metadata = {
            **(metadata or {}),
            "page": page,
            "start_row": start_row,
            "page_size": page_size,
        }
        response = make_get_request(
            feed,
            page_params,
            pipeline_name=pipeline_name,
            run_id=run_id,
            feed_name=feed_name,
            target_table=target_table,
            operation_name=operation_name,
            database=database,
            log_fetch=log_fetch,
            timeout=timeout,
            max_attempts=max_attempts,
            retry_delay_seconds=retry_delay_seconds,
            metadata=request_metadata,
        )

        text = response.text
        if not text.strip():
            truncated = False
            break

        page_df = pd.read_csv(BytesIO(response.content), encoding="utf-8-sig")
        if page_df.empty:
            truncated = False
            break

        frames.append(page_df)
        if len(page_df) < page_size:
            truncated = False
            break

        start_row += page_size

    if truncated:
        logger.warning(
            "PJM %s hit max_pages=%s at page_size=%s; result set may be "
            "truncated. Raise max_pages or narrow the query window.",
            feed,
            max_pages,
            page_size,
        )

    if not frames:
        return pd.DataFrame()

    df = pd.concat(frames, ignore_index=True)
    df.columns = df.columns.str.encode("ascii", errors="ignore").str.decode("ascii")
    return df


def _retry_delay(response: requests.Response, default_seconds: int) -> int:
    """Honour a ``Retry-After`` header when present, else the default delay."""
    retry_after = response.headers.get("Retry-After")
    if retry_after:
        try:
            return max(default_seconds, int(retry_after))
        except ValueError:
            pass
    return default_seconds


def _rows_returned_from_response(response: requests.Response) -> int | None:
    """Best-effort row count from a PJM response (CSV or JSON)."""
    content_type = response.headers.get("Content-Type", "")

    if "json" in content_type.lower():
        try:
            payload = response.json()
        except ValueError:
            return None
        if isinstance(payload, list):
            return len(payload)
        if isinstance(payload, dict):
            for key in ("items", "data"):
                if isinstance(payload.get(key), list):
                    return len(payload[key])
        return None

    text = response.text
    if not text.strip():
        return 0
    # CSV: data rows = non-empty lines minus the header row.
    line_count = sum(1 for line in text.splitlines() if line.strip())
    return max(0, line_count - 1)
