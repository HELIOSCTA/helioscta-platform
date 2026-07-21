"""WSI Trader HTTP client helpers."""

from __future__ import annotations

import logging
import threading
import time
from io import StringIO
from typing import Any
from urllib.parse import urlparse

import pandas as pd
import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

from backend import credentials
from backend.utils.ops_logging import log_api_fetch, redact_secrets

DEFAULT_CONNECT_TIMEOUT_SECONDS = 10
DEFAULT_READ_TIMEOUT_SECONDS = 120
DEFAULT_TIMEOUT = (DEFAULT_CONNECT_TIMEOUT_SECONDS, DEFAULT_READ_TIMEOUT_SECONDS)
DEFAULT_RETRY_TOTAL = 3
DEFAULT_RETRY_BACKOFF_FACTOR = 1.0
DEFAULT_RETRY_STATUS_FORCELIST = (429, 500, 502, 503, 504)
DEFAULT_MIN_INTERVAL_SECONDS = 0.5
SENSITIVE_QUERY_KEYS = {"Account", "Profile", "Password"}

logger = logging.getLogger(__name__)


class MissingWsiCredentialsError(RuntimeError):
    """Raised when required WSI Trader credentials are unavailable."""


def wsi_credentials_available() -> bool:
    return all(
        [
            credentials.WSI_TRADER_USERNAME,
            credentials.WSI_TRADER_NAME,
            credentials.WSI_TRADER_PASSWORD,
        ]
    )


def wsi_credentials() -> dict[str, str]:
    if not wsi_credentials_available():
        raise MissingWsiCredentialsError(
            "Missing WSI Trader credentials. Set WSI_TRADER_USERNAME, "
            "WSI_TRADER_NAME, and WSI_TRADER_PASSWORD."
        )
    return {
        "Account": str(credentials.WSI_TRADER_USERNAME),
        "Profile": str(credentials.WSI_TRADER_NAME),
        "Password": str(credentials.WSI_TRADER_PASSWORD),
    }


def sanitized_request_context(
    base_url: str,
    params: dict[str, Any] | None = None,
) -> dict[str, Any]:
    merged = {**{key: "***" for key in SENSITIVE_QUERY_KEYS}, **(params or {})}
    for key in SENSITIVE_QUERY_KEYS:
        if key in merged:
            merged[key] = "***"
    return {"base_url": base_url, "params": merged}


def log_wsi_fetch_event(
    *,
    base_url: str,
    pipeline_name: str,
    operation_name: str,
    target_table: str | None,
    status: str,
    elapsed_ms: int,
    run_id: str | None = None,
    feed_name: str | None = None,
    database: str | None = None,
    http_status: int | None = None,
    rows_returned: int | None = None,
    error_type: str | None = None,
    error_message: str | None = None,
    metadata: dict[str, Any] | None = None,
) -> None:
    parsed = urlparse(base_url)
    log_api_fetch(
        actor_type="backend",
        provider="wsi",
        pipeline_name=pipeline_name,
        run_id=run_id,
        operation_name=operation_name,
        feed_name=feed_name,
        target_table=target_table,
        method="GET",
        target_host=parsed.netloc,
        target_path=parsed.path,
        status=status,
        http_status=http_status,
        elapsed_ms=elapsed_ms,
        rows_returned=rows_returned,
        error_type=error_type,
        error_message=redact_secrets(error_message),
        metadata=metadata,
        database=database,
    )


def with_telemetry_stage(
    metadata: dict[str, Any] | None,
    stage: str,
) -> dict[str, Any]:
    staged = dict(metadata or {})
    staged["telemetry_stage"] = stage
    return staged


class WsiTraderHttpClient:
    """Shared WSI HTTP client with retry, timeout, throttling, and telemetry."""

    def __init__(
        self,
        timeout: tuple[int, int] = DEFAULT_TIMEOUT,
        min_interval_seconds: float = DEFAULT_MIN_INTERVAL_SECONDS,
    ) -> None:
        self.timeout = timeout
        self.min_interval_seconds = min_interval_seconds
        self._last_request_monotonic = 0.0
        self._throttle_lock = threading.Lock()
        self.session = requests.Session()

        retries = Retry(
            total=DEFAULT_RETRY_TOTAL,
            connect=DEFAULT_RETRY_TOTAL,
            read=DEFAULT_RETRY_TOTAL,
            status=DEFAULT_RETRY_TOTAL,
            backoff_factor=DEFAULT_RETRY_BACKOFF_FACTOR,
            status_forcelist=DEFAULT_RETRY_STATUS_FORCELIST,
            allowed_methods=frozenset(["GET"]),
            raise_on_status=False,
        )
        adapter = HTTPAdapter(max_retries=retries)
        self.session.mount("https://", adapter)
        self.session.mount("http://", adapter)

    def _throttle(self) -> None:
        if self.min_interval_seconds <= 0:
            return
        with self._throttle_lock:
            elapsed = time.monotonic() - self._last_request_monotonic
            if elapsed < self.min_interval_seconds:
                time.sleep(self.min_interval_seconds - elapsed)
            self._last_request_monotonic = time.monotonic()

    def get_text(
        self,
        *,
        base_url: str,
        params: dict[str, Any] | None = None,
        pipeline_name: str,
        operation_name: str,
        target_table: str | None,
        run_id: str | None = None,
        feed_name: str | None = None,
        database: str | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> str:
        merged_params = {**wsi_credentials(), **(params or {})}
        started_at = time.perf_counter()
        status = "success"
        http_status: int | None = None
        error_type: str | None = None
        error_message: str | None = None
        text = ""

        try:
            self._throttle()
            response = self.session.get(
                base_url,
                params=merged_params,
                timeout=self.timeout,
            )
            http_status = response.status_code
            response.raise_for_status()
            text = response.content.decode("utf-8")
            if not text.strip():
                raise ValueError("WSI response body is empty.")
            return text
        except Exception as exc:
            status = "failure"
            error_type = type(exc).__name__
            error_message = redact_secrets(str(exc))
            raise
        finally:
            elapsed_ms = round((time.perf_counter() - started_at) * 1000)
            log_wsi_fetch_event(
                base_url=base_url,
                pipeline_name=pipeline_name,
                operation_name=operation_name,
                target_table=target_table,
                status=status,
                http_status=http_status,
                elapsed_ms=elapsed_ms,
                run_id=run_id,
                feed_name=feed_name,
                database=database,
                error_type=error_type,
                error_message=error_message,
                metadata=metadata,
            )


_HTTP_CLIENT = WsiTraderHttpClient()


def read_wsi_csv(
    *,
    base_url: str,
    params: dict[str, Any] | None,
    skiprows: int,
    required_columns: list[str],
    pipeline_name: str,
    operation_name: str,
    target_table: str | None,
    run_id: str | None,
    feed_name: str | None,
    database: str | None,
    metadata: dict[str, Any] | None = None,
    http_client: WsiTraderHttpClient = _HTTP_CLIENT,
) -> pd.DataFrame:
    text = http_client.get_text(
        base_url=base_url,
        params=params,
        pipeline_name=pipeline_name,
        operation_name=operation_name,
        target_table=target_table,
        run_id=run_id,
        feed_name=feed_name,
        database=database,
        metadata=metadata,
    )
    parse_started_at = time.perf_counter()
    try:
        try:
            df = pd.read_csv(StringIO(text), skiprows=skiprows)
        except pd.errors.EmptyDataError as exc:
            raise ValueError("WSI response contained no CSV data.") from exc
        except pd.errors.ParserError as exc:
            raise ValueError(f"Failed to parse WSI CSV response: {exc}") from exc

        if df.empty:
            raise ValueError("WSI response returned 0 rows.")
        missing = [column for column in required_columns if column not in df.columns]
        if missing:
            raise ValueError(
                "WSI response missing required columns. "
                f"Missing={missing}, Actual={df.columns.tolist()}"
            )
    except Exception as exc:
        log_wsi_fetch_event(
            base_url=base_url,
            pipeline_name=pipeline_name,
            operation_name=operation_name,
            target_table=target_table,
            status="failure",
            http_status=200,
            elapsed_ms=round((time.perf_counter() - parse_started_at) * 1000),
            run_id=run_id,
            feed_name=feed_name,
            database=database,
            error_type=type(exc).__name__,
            error_message=str(exc),
            metadata=with_telemetry_stage(metadata, "parse_csv"),
        )
        raise
    return df
