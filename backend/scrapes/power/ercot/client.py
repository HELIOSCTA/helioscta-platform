"""ERCOT Public Reports API client.

Source documentation:
- https://developer.ercot.com/applications/pubapi/user-guide/registration-and-authentication/
- https://developer.ercot.com/applications/pubapi/user-guide/using-api/

This module centralizes ERCOT Public Reports authentication, bounded request
retry handling, response parsing, and ops API telemetry. It intentionally does
not define any production feed runtime or database write path.
"""

from __future__ import annotations

import json
import logging
import time
from urllib.parse import urlsplit

import pandas as pd
import requests

from backend import credentials
from backend.utils.ops_logging import log_api_fetch, redact_secrets


logger = logging.getLogger(__name__)

BASE_URL = "https://api.ercot.com/api/public-reports"
AUTH_URL = (
    "https://ercotb2c.b2clogin.com/ercotb2c.onmicrosoft.com/"
    "B2C_1_PUBAPI-ROPC-FLOW/oauth2/v2.0/token"
)
AUTH_SCOPE = "openid fec253ea-0d06-4272-a5e6-b478baeecd70 offline_access"
CLIENT_ID = "fec253ea-0d06-4272-a5e6-b478baeecd70"

DEFAULT_TIMEOUT_SECONDS = 60
DEFAULT_AUTH_TIMEOUT_SECONDS = 30
DEFAULT_PAGE_SIZE = 1_000_000
DEFAULT_MAX_ATTEMPTS = 3
DEFAULT_RETRY_DELAY_SECONDS = 5
RETRYABLE_STATUS_CODES = {429, 500, 502, 503, 504}


def get_authentication_headers(
    *,
    username: str | None = None,
    passcode: str | None = None,
    api_key: str | None = None,
    pipeline_name: str | None = None,
    run_id: str | None = None,
    database: str | None = None,
    timeout: int = DEFAULT_AUTH_TIMEOUT_SECONDS,
) -> dict[str, str]:
    """Authenticate with ERCOT B2C and return Public API request headers."""
    username = username or credentials.ERCOT_USERNAME
    passcode = passcode or credentials.ERCOT_PASSCODE
    api_key = api_key or credentials.ERCOT_API_KEY

    missing = [
        name
        for name, value in {
            "ERCOT_USERNAME": username,
            "ERCOT_PASSCODE": passcode,
            "ERCOT_API_KEY": api_key,
        }.items()
        if not value
    ]
    if missing:
        raise RuntimeError(f"Missing ERCOT credential(s): {', '.join(missing)}")

    parsed_url = urlsplit(AUTH_URL)
    started = time.perf_counter()
    response: requests.Response | None = None

    def _emit(
        *,
        status: str,
        http_status: int | None,
        error_type: str | None = None,
        error_message: str | None = None,
    ) -> None:
        log_api_fetch(
            actor_type="scrape",
            provider="ercot",
            pipeline_name=pipeline_name,
            run_id=run_id,
            operation_name="authenticate",
            method="POST",
            target_host=parsed_url.netloc,
            target_path=parsed_url.path,
            status=status,
            http_status=http_status,
            elapsed_ms=round((time.perf_counter() - started) * 1000),
            error_type=error_type,
            error_message=redact_secrets(error_message),
            database=database,
        )

    try:
        response = requests.post(
            AUTH_URL,
            data={
                "username": username,
                "password": passcode,
                "grant_type": "password",
                "scope": AUTH_SCOPE,
                "client_id": CLIENT_ID,
                "response_type": "id_token",
            },
            timeout=timeout,
        )
        response.raise_for_status()
    except requests.RequestException as exc:
        http_status = response.status_code if response is not None else None
        _emit(
            status="failure",
            http_status=http_status,
            error_type=type(exc).__name__,
            error_message=str(exc),
        )
        raise

    payload = response.json()
    token = payload.get("id_token") or payload.get("access_token")
    if not token:
        _emit(
            status="failure",
            http_status=response.status_code,
            error_type="AuthError",
            error_message="ERCOT authentication response did not include a token",
        )
        raise RuntimeError("ERCOT authentication response did not include a token")

    _emit(status="success", http_status=response.status_code)
    return {
        "accept": "application/json",
        "Ocp-Apim-Subscription-Key": api_key,
        "Authorization": f"Bearer {token}",
    }


def make_get_request(
    endpoint: str,
    params: dict[str, object] | None = None,
    *,
    headers: dict[str, str] | None = None,
    base_url: str = BASE_URL,
    pipeline_name: str | None = None,
    run_id: str | None = None,
    feed_name: str | None = None,
    target_table: str | None = None,
    operation_name: str | None = None,
    database: str | None = None,
    log_fetch: bool = True,
    timeout: int = DEFAULT_TIMEOUT_SECONDS,
    max_attempts: int = DEFAULT_MAX_ATTEMPTS,
    retry_delay_seconds: int = DEFAULT_RETRY_DELAY_SECONDS,
    metadata: dict | None = None,
) -> requests.Response:
    """Make an authenticated ERCOT Public Reports GET request."""
    headers = headers or get_authentication_headers(
        pipeline_name=pipeline_name,
        run_id=run_id,
        database=database,
    )
    url = f"{base_url.rstrip('/')}/{endpoint.lstrip('/')}"
    parsed_url = urlsplit(url)
    operation = operation_name or endpoint
    request_params = dict(params or {})
    request_params.setdefault("size", DEFAULT_PAGE_SIZE)

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
            provider="ercot",
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
            error_message=redact_secrets(error_message),
            metadata=metadata,
            database=database,
        )

    for attempt in range(1, max_attempts + 1):
        started = time.perf_counter()
        response: requests.Response | None = None
        try:
            response = requests.get(
                url,
                headers=headers,
                params=request_params,
                timeout=timeout,
            )
            elapsed_ms = round((time.perf_counter() - started) * 1000)

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
                    "ERCOT %s returned HTTP %s (attempt %s/%s); retrying in %ss",
                    endpoint,
                    response.status_code,
                    attempt,
                    max_attempts,
                    delay,
                )
                time.sleep(delay)
                continue

            response.raise_for_status()
            rows_returned = _rows_returned_from_response(response)
            _emit(
                status="success",
                http_status=response.status_code,
                elapsed_ms=elapsed_ms,
                attempt=attempt,
                rows_returned=rows_returned,
            )
            return response

        except requests.RequestException as exc:
            elapsed_ms = round((time.perf_counter() - started) * 1000)
            http_status = response.status_code if response is not None else None
            _emit(
                status="failure",
                http_status=http_status,
                elapsed_ms=elapsed_ms,
                attempt=attempt,
                error_type=type(exc).__name__,
                error_message=str(exc),
            )
            is_retryable_exception = isinstance(
                exc,
                (requests.ConnectionError, requests.Timeout),
            )
            is_retryable_status = http_status in RETRYABLE_STATUS_CODES
            if (is_retryable_exception or is_retryable_status) and attempt < max_attempts:
                time.sleep(retry_delay_seconds)
                continue
            raise

    raise RuntimeError(
        f"ERCOT request to {endpoint} exhausted {max_attempts} attempts."
    )


def parse_response(response: requests.Response) -> pd.DataFrame:
    """Parse a standard ERCOT Public Reports JSON payload into a DataFrame."""
    payload = response.json()
    fields = payload.get("fields", [])
    data = payload.get("data", [])
    columns = [field["name"] for field in fields if "name" in field]
    return pd.DataFrame(data, columns=columns)


def _retry_delay(response: requests.Response, default_seconds: int) -> int:
    retry_after = response.headers.get("Retry-After")
    if retry_after:
        try:
            return max(default_seconds, int(retry_after))
        except ValueError:
            pass
    return default_seconds


def _rows_returned_from_response(response: requests.Response) -> int | None:
    try:
        payload = response.json()
    except (json.JSONDecodeError, ValueError):
        return None

    data = payload.get("data") if isinstance(payload, dict) else None
    return len(data) if isinstance(data, list) else None

