"""Meteologica xTraders API client helpers."""

from __future__ import annotations

import base64
import json
import logging
import time
from dataclasses import dataclass
from typing import Literal
from urllib.parse import urlsplit

import requests

from backend import credentials
from backend.utils.ops_logging import log_api_fetch, redact_secrets

BASE_URL = "https://api-markets.meteologica.com/api/v1"
DEFAULT_TIMEOUT_SECONDS = 60
DEFAULT_TOKEN_REFRESH_THRESHOLD_SECONDS = 300

Account = Literal["iso"]

logger = logging.getLogger(__name__)


class MissingMeteologicaCredentialsError(RuntimeError):
    """Raised when required Meteologica credentials are unavailable."""


@dataclass
class _TokenState:
    token: str | None = None


_TOKEN_STATE: dict[Account, _TokenState] = {"iso": _TokenState()}


def meteologica_credentials_available(account: Account = "iso") -> bool:
    if account != "iso":
        return False
    return all(
        [
            credentials.XTRADERS_API_USERNAME_ISO,
            credentials.XTRADERS_API_PASSWORD_ISO,
        ]
    )


def _credentials(account: Account = "iso") -> tuple[str, str]:
    if not meteologica_credentials_available(account):
        raise MissingMeteologicaCredentialsError(
            "Missing Meteologica ISO credentials. Set "
            "XTRADERS_API_USERNAME_ISO and XTRADERS_API_PASSWORD_ISO."
        )
    return (
        str(credentials.XTRADERS_API_USERNAME_ISO),
        str(credentials.XTRADERS_API_PASSWORD_ISO),
    )


def get_token(
    *,
    account: Account = "iso",
    base_url: str = BASE_URL,
    timeout: int = DEFAULT_TIMEOUT_SECONDS,
) -> str:
    """Return a valid in-memory Meteologica token for the selected account."""
    state = _TOKEN_STATE[account]
    if state.token and not _is_expiring_soon(state.token):
        return state.token

    username, password = _credentials(account)
    logger.info("Obtaining Meteologica API token for account=%s", account)
    response = requests.post(
        f"{base_url.rstrip('/')}/login",
        json={"user": username, "password": password},
        timeout=timeout,
    )
    response.raise_for_status()
    payload = _json_object(response)
    token = payload.get("token")
    if not token:
        raise RuntimeError("Meteologica login response did not include a token.")
    state.token = str(token)
    return state.token


def make_get_request(
    endpoint: str,
    *,
    params: dict | None = None,
    account: Account = "iso",
    base_url: str = BASE_URL,
    pipeline_name: str | None = None,
    run_id: str | None = None,
    content_id: int | None = None,
    feed_name: str | None = None,
    target_table: str | None = None,
    operation_name: str | None = None,
    database: str | None = None,
    timeout: int = DEFAULT_TIMEOUT_SECONDS,
    metadata: dict | None = None,
) -> requests.Response:
    """Make one authenticated Meteologica GET request with telemetry."""
    token = get_token(account=account, base_url=base_url, timeout=timeout)
    query_params = {"token": token, **(params or {})}
    url = f"{base_url.rstrip('/')}/{endpoint.lstrip('/')}"
    parsed_url = urlsplit(url)
    operation = operation_name or endpoint.strip("/")
    started = time.perf_counter()
    response: requests.Response | None = None

    try:
        response = requests.get(url, params=query_params, timeout=timeout)
        elapsed_ms = round((time.perf_counter() - started) * 1000)
        response.raise_for_status()
        log_api_fetch(
            actor_type="scrape",
            provider="meteologica",
            pipeline_name=pipeline_name,
            run_id=run_id,
            operation_name=operation,
            content_id=content_id,
            feed_name=feed_name,
            target_table=target_table,
            method="GET",
            target_host=parsed_url.netloc,
            target_path=parsed_url.path,
            status="success",
            http_status=response.status_code,
            elapsed_ms=elapsed_ms,
            rows_returned=_rows_returned_from_response(response),
            metadata={**(metadata or {}), "account": account},
            database=database,
        )
        return response
    except requests.RequestException as exc:
        elapsed_ms = round((time.perf_counter() - started) * 1000)
        log_api_fetch(
            actor_type="scrape",
            provider="meteologica",
            pipeline_name=pipeline_name,
            run_id=run_id,
            operation_name=operation,
            content_id=content_id,
            feed_name=feed_name,
            target_table=target_table,
            method="GET",
            target_host=parsed_url.netloc,
            target_path=parsed_url.path,
            status="failure",
            http_status=response.status_code if response is not None else None,
            elapsed_ms=elapsed_ms,
            error_type=type(exc).__name__,
            error_message=redact_secrets(str(exc)),
            metadata={**(metadata or {}), "account": account},
            database=database,
        )
        raise


def parse_json_response(response: requests.Response) -> dict:
    """Return a Meteologica JSON object payload."""
    return _json_object(response)


def _json_object(response: requests.Response) -> dict:
    try:
        payload = response.json()
    except (json.JSONDecodeError, ValueError) as exc:
        raise RuntimeError("Meteologica response did not contain valid JSON.") from exc
    if not isinstance(payload, dict):
        raise RuntimeError("Meteologica JSON response was not an object.")
    return payload


def _is_expiring_soon(
    token: str,
    threshold_seconds: int = DEFAULT_TOKEN_REFRESH_THRESHOLD_SECONDS,
) -> bool:
    payload = _decode_jwt_payload(token)
    exp = payload.get("exp")
    if not isinstance(exp, (int, float)):
        return True
    return (float(exp) - time.time()) < threshold_seconds


def _decode_jwt_payload(token: str) -> dict:
    try:
        payload_segment = token.split(".")[1]
        padded = payload_segment + "=" * (-len(payload_segment) % 4)
        decoded = base64.urlsafe_b64decode(padded.encode("ascii"))
        payload = json.loads(decoded.decode("utf-8"))
    except Exception:
        return {}
    return payload if isinstance(payload, dict) else {}


def _rows_returned_from_response(response: requests.Response) -> int | None:
    try:
        payload = response.json()
    except (json.JSONDecodeError, ValueError):
        return None
    data = payload.get("data") if isinstance(payload, dict) else None
    return len(data) if isinstance(data, list) else None

