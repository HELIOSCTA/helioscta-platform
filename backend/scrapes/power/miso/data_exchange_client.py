"""MISO Data Exchange Pricing API client.

Source documentation:
- https://help.misoenergy.org/knowledgebase/article/KA-01489/en-us

The Pricing API uses the Azure API Management subscription key header
``Ocp-Apim-Subscription-Key``. Do not put the subscription key in query params
or fetch-log metadata.
"""
from __future__ import annotations

import json
import logging
import time
from urllib.parse import urlsplit

import requests

from backend import credentials
from backend.utils.ops_logging import log_api_fetch, redact_secrets


BASE_URL = "https://apim.misoenergy.org/pricing/v1"
SUBSCRIPTION_KEY_HEADER = "Ocp-Apim-Subscription-Key"
DEFAULT_TIMEOUT_SECONDS = 60
DEFAULT_MAX_ATTEMPTS = 3
DEFAULT_RETRY_DELAY_SECONDS = 5.0
MAX_PAGES = 100

logger = logging.getLogger(__name__)


class MISODataExchangeError(RuntimeError):
    """Raised when the MISO Data Exchange API request fails."""

    def __init__(self, message: str, *, status_code: int | None = None) -> None:
        super().__init__(message)
        self.status_code = status_code


class MISODataNotAvailable(MISODataExchangeError):
    """Raised when MISO has not published a requested Pricing API dataset."""


def fetch_pricing_data(
    endpoint: str,
    *,
    params: dict | None = None,
    subscription_key: str | None = None,
    pipeline_name: str | None = None,
    run_id: str | None = None,
    feed_name: str | None = None,
    target_table: str | None = None,
    operation_name: str | None = None,
    metadata: dict | None = None,
    database: str | None = None,
    timeout_seconds: int = DEFAULT_TIMEOUT_SECONDS,
    max_attempts: int = DEFAULT_MAX_ATTEMPTS,
    retry_delay_seconds: float = DEFAULT_RETRY_DELAY_SECONDS,
    log_fetch: bool = True,
    max_pages: int = MAX_PAGES,
) -> list[dict]:
    """Fetch all paged records from one MISO Pricing API endpoint."""
    resolved_key = subscription_key or credentials.MISO_DATA_EXCHANGE_SUBSCRIPTION_KEY
    if not resolved_key:
        raise RuntimeError(
            "MISO_DATA_EXCHANGE_SUBSCRIPTION_KEY is required for the "
            "MISO Data Exchange Pricing API."
        )

    endpoint_path = endpoint.strip("/")
    url = f"{BASE_URL.rstrip('/')}/{endpoint_path}"
    operation = operation_name or endpoint_path
    base_params = dict(params or {})
    rows: list[dict] = []
    page_number = 1

    while True:
        if page_number > max_pages:
            raise MISODataExchangeError(
                f"MISO Data Exchange pagination exceeded {max_pages} pages "
                f"for {endpoint_path}"
            )

        page_params = {**base_params, "pageNumber": page_number}
        payload = _get_json_page(
            url=url,
            params=page_params,
            subscription_key=resolved_key,
            pipeline_name=pipeline_name,
            run_id=run_id,
            feed_name=feed_name,
            target_table=target_table,
            operation_name=operation,
            metadata={
                "api_family": "data_exchange_pricing",
                "page_number": page_number,
                **(metadata or {}),
            },
            database=database,
            timeout_seconds=timeout_seconds,
            max_attempts=max_attempts,
            retry_delay_seconds=retry_delay_seconds,
            log_fetch=log_fetch,
        )
        data = payload.get("data")
        if data is None:
            data = []
        if not isinstance(data, list):
            raise MISODataExchangeError(
                "MISO Data Exchange response field 'data' was not a list"
            )
        rows.extend(data)

        page_info = payload.get("page") or {}
        if not isinstance(page_info, dict):
            page_info = {}
        if page_info.get("lastPage") is True:
            break
        total_pages = _parse_int(page_info.get("totalPages"))
        if total_pages is not None and page_number >= total_pages:
            break
        if not data:
            break
        page_number += 1

    return rows


def _get_json_page(
    *,
    url: str,
    params: dict,
    subscription_key: str,
    pipeline_name: str | None,
    run_id: str | None,
    feed_name: str | None,
    target_table: str | None,
    operation_name: str,
    metadata: dict | None,
    database: str | None,
    timeout_seconds: int,
    max_attempts: int,
    retry_delay_seconds: float,
    log_fetch: bool,
) -> dict:
    headers = {
        "accept": "application/json",
        SUBSCRIPTION_KEY_HEADER: subscription_key,
    }
    parsed_url = urlsplit(url)

    for attempt in range(1, max_attempts + 1):
        started = time.perf_counter()
        response: requests.Response | None = None
        try:
            response = requests.get(
                url,
                headers=headers,
                params=params,
                timeout=timeout_seconds,
            )
            elapsed_ms = round((time.perf_counter() - started) * 1000)
            payload = _parse_json_response(response)
            if 200 <= response.status_code < 300:
                if log_fetch:
                    _log_fetch_attempt(
                        parsed_url=parsed_url,
                        pipeline_name=pipeline_name,
                        run_id=run_id,
                        operation_name=operation_name,
                        feed_name=feed_name,
                        target_table=target_table,
                        status="success",
                        http_status=response.status_code,
                        elapsed_ms=elapsed_ms,
                        attempt=attempt,
                        max_attempts=max_attempts,
                        rows_returned=_rows_returned_from_payload(payload),
                        metadata=metadata,
                        database=database,
                    )
                return payload

            message = _error_message(response=response, payload=payload)
            if log_fetch:
                _log_fetch_attempt(
                    parsed_url=parsed_url,
                    pipeline_name=pipeline_name,
                    run_id=run_id,
                    operation_name=operation_name,
                    feed_name=feed_name,
                    target_table=target_table,
                    status="failure",
                    http_status=response.status_code,
                    elapsed_ms=elapsed_ms,
                    attempt=attempt,
                    max_attempts=max_attempts,
                    rows_returned=_rows_returned_from_payload(payload),
                    error_type="HTTPError",
                    error_message=message,
                    metadata=metadata,
                    database=database,
                )

            if response.status_code == 404:
                raise MISODataNotAvailable(message, status_code=response.status_code)
            if response.status_code not in {429, 500, 502, 503, 504}:
                raise MISODataExchangeError(
                    message,
                    status_code=response.status_code,
                )
            if attempt == max_attempts:
                raise MISODataExchangeError(
                    message,
                    status_code=response.status_code,
                )
            time.sleep(_retry_delay(response, retry_delay_seconds))
        except (requests.RequestException, json.JSONDecodeError, ValueError) as exc:
            elapsed_ms = round((time.perf_counter() - started) * 1000)
            http_status = response.status_code if response is not None else None
            if log_fetch:
                _log_fetch_attempt(
                    parsed_url=parsed_url,
                    pipeline_name=pipeline_name,
                    run_id=run_id,
                    operation_name=operation_name,
                    feed_name=feed_name,
                    target_table=target_table,
                    status="failure",
                    http_status=http_status,
                    elapsed_ms=elapsed_ms,
                    attempt=attempt,
                    max_attempts=max_attempts,
                    error_type=type(exc).__name__,
                    error_message=str(exc),
                    metadata=metadata,
                    database=database,
                )
            if attempt == max_attempts:
                raise MISODataExchangeError(
                    f"MISO Data Exchange request failed: {redact_secrets(str(exc))}",
                    status_code=http_status,
                ) from exc
            time.sleep(retry_delay_seconds)

    raise MISODataExchangeError(f"MISO request to {url} exhausted attempts.")


def _parse_json_response(response: requests.Response) -> dict:
    payload = response.json()
    if not isinstance(payload, dict):
        raise MISODataExchangeError("MISO Data Exchange response was not a JSON object")
    return payload


def _error_message(*, response: requests.Response, payload: dict) -> str:
    detail = payload.get("message") or payload.get("error") or response.text
    return redact_secrets(
        f"MISO Data Exchange HTTP {response.status_code}: {str(detail)[:500]}"
    ) or f"MISO Data Exchange HTTP {response.status_code}"


def _retry_delay(response: requests.Response, fallback_seconds: float) -> float:
    value = response.headers.get("Retry-After")
    if value is None:
        return fallback_seconds
    try:
        return max(0.0, float(value))
    except ValueError:
        return fallback_seconds


def _rows_returned_from_payload(payload: dict) -> int | None:
    data = payload.get("data")
    if isinstance(data, list):
        return len(data)
    return None


def _parse_int(value) -> int | None:
    if value is None:
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


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
