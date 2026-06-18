"""NOAA AviationWeather API client helpers."""

from __future__ import annotations

import logging
import time
from typing import Any
from urllib.parse import urlparse

import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

from backend.utils.ops_logging import log_api_fetch, redact_secrets

BASE_URL = "https://aviationweather.gov/api/data"
DEFAULT_TIMEOUT = (10, 60)
DEFAULT_RETRY_TOTAL = 3
DEFAULT_RETRY_BACKOFF_FACTOR = 1.0
DEFAULT_RETRY_STATUS_FORCELIST = (429, 500, 502, 503, 504)
DEFAULT_USER_AGENT = "HeliosCTA weather scrape (+https://helioscta.local)"

logger = logging.getLogger(__name__)


class NoaaAviationWeatherClient:
    """Small JSON client with retry, timeout, user-agent, and fetch telemetry."""

    def __init__(
        self,
        *,
        base_url: str = BASE_URL,
        timeout: tuple[int, int] = DEFAULT_TIMEOUT,
        user_agent: str = DEFAULT_USER_AGENT,
    ) -> None:
        self.base_url = base_url.rstrip("/")
        self.timeout = timeout
        self.user_agent = user_agent
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

    def get_metars(
        self,
        *,
        station_ids: list[str],
        hours: int,
        pipeline_name: str,
        operation_name: str,
        target_table: str,
        run_id: str | None,
        feed_name: str | None,
        database: str | None,
        metadata: dict[str, Any] | None = None,
    ) -> list[dict[str, Any]]:
        url = f"{self.base_url}/metar"
        params = {
            "ids": ",".join(station_ids),
            "format": "json",
            "hours": str(hours),
        }
        parsed = urlparse(url)
        started_at = time.perf_counter()
        status = "success"
        http_status: int | None = None
        rows_returned: int | None = None
        error_type: str | None = None
        error_message: str | None = None

        try:
            response = self.session.get(
                url,
                params=params,
                headers={"User-Agent": self.user_agent},
                timeout=self.timeout,
            )
            http_status = response.status_code
            if response.status_code == 204:
                rows_returned = 0
                return []
            response.raise_for_status()
            payload = response.json()
            if not isinstance(payload, list):
                raise ValueError(
                    f"NOAA METAR response was {type(payload).__name__}, expected list."
                )
            rows_returned = len(payload)
            return payload
        except Exception as exc:
            status = "failure"
            error_type = type(exc).__name__
            error_message = redact_secrets(str(exc))
            raise
        finally:
            elapsed_ms = round((time.perf_counter() - started_at) * 1000)
            log_api_fetch(
                actor_type="backend",
                provider="noaa_aviationweather",
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
                error_message=error_message,
                metadata={
                    "station_count": len(station_ids),
                    "hours": hours,
                    **(metadata or {}),
                },
                database=database,
            )


CLIENT = NoaaAviationWeatherClient()
