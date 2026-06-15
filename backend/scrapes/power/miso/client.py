"""MISO public Real-Time Data API client.

Source documentation:
- https://www.misoenergy.org/markets-and-operations/rtdataapis/

MISO asks public users to avoid accessing these real-time JSON links more than
once per minute. Runtime feeds should therefore make one bounded request per
run unless an operator explicitly designs a slower backoff.
"""
from __future__ import annotations

import json
import logging
import time
from urllib.parse import urlsplit

import requests

from backend.utils.ops_logging import log_api_fetch, redact_secrets


BASE_URL = "https://public-api.misoenergy.org"
DEFAULT_TIMEOUT_SECONDS = 60
DEFAULT_MAX_ATTEMPTS = 1

logger = logging.getLogger(__name__)


def make_get_request(
    endpoint: str,
    *,
    base_url: str = BASE_URL,
    pipeline_name: str | None = None,
    run_id: str | None = None,
    feed_name: str | None = None,
    target_table: str | None = None,
    operation_name: str | None = None,
    database: str | None = None,
    timeout: int = DEFAULT_TIMEOUT_SECONDS,
    max_attempts: int = DEFAULT_MAX_ATTEMPTS,
    metadata: dict | None = None,
) -> requests.Response:
    """Make one bounded GET request to a MISO public JSON endpoint."""
    url = f"{base_url.rstrip('/')}/{endpoint.lstrip('/')}"
    parsed_url = urlsplit(url)
    operation = operation_name or endpoint.strip("/")

    for attempt in range(1, max_attempts + 1):
        started = time.perf_counter()
        response: requests.Response | None = None
        try:
            response = requests.get(
                url,
                headers={"accept": "application/json"},
                timeout=timeout,
            )
            elapsed_ms = round((time.perf_counter() - started) * 1000)
            response.raise_for_status()
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
                max_attempts=max_attempts,
                rows_returned=_rows_returned_from_response(response),
                metadata=metadata,
                database=database,
            )
            return response
        except requests.RequestException as exc:
            elapsed_ms = round((time.perf_counter() - started) * 1000)
            http_status = response.status_code if response is not None else None
            _log_fetch_attempt(
                parsed_url=parsed_url,
                pipeline_name=pipeline_name,
                run_id=run_id,
                operation_name=operation,
                feed_name=feed_name,
                target_table=target_table,
                status="failure",
                http_status=http_status,
                elapsed_ms=elapsed_ms,
                attempt=attempt,
                max_attempts=max_attempts,
                error_type=type(exc).__name__,
                error_message=redact_secrets(str(exc)),
                metadata=metadata,
                database=database,
            )
            if attempt == max_attempts:
                raise

    raise RuntimeError(f"MISO request to {endpoint} exhausted {max_attempts} attempts.")


def parse_json_response(response: requests.Response) -> dict:
    """Return a MISO JSON response payload."""
    try:
        payload = response.json()
    except (json.JSONDecodeError, ValueError) as exc:
        raise RuntimeError("MISO response did not contain valid JSON") from exc
    if not isinstance(payload, dict):
        raise RuntimeError("MISO JSON response was not an object")
    return payload


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
        provider="miso",
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
        payload = response.json()
    except (json.JSONDecodeError, ValueError):
        return None

    load_info = payload.get("LoadInfo") if isinstance(payload, dict) else None
    if not isinstance(load_info, dict):
        return None
    row_count = 0
    for key in ("ClearedMW", "MediumTermLoadForecast", "FiveMinTotalLoad"):
        value = load_info.get(key)
        if isinstance(value, list):
            row_count += len(value)
    return row_count or None
