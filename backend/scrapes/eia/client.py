"""EIA Open Data API client helpers."""

from __future__ import annotations

import logging
import time
from collections.abc import Iterable
from typing import Any
from urllib.parse import urlsplit

import requests

from backend.utils.ops_logging import log_api_fetch, redact_secrets


BASE_URL = "https://api.eia.gov/v2"
DEFAULT_TIMEOUT_SECONDS = 60
DEFAULT_MAX_ATTEMPTS = 3
DEFAULT_PAGE_SIZE = 5000
DEFAULT_RETRY_DELAY_SECONDS = 2.0

logger = logging.getLogger(__name__)


def get_eia_v2_data(
    route: str,
    *,
    api_key: str,
    frequency: str,
    data_fields: Iterable[str],
    start: str,
    end: str,
    facets: dict[str, Iterable[str]] | None = None,
    sort_column: str = "period",
    sort_direction: str = "asc",
    page_size: int = DEFAULT_PAGE_SIZE,
    timeout: int = DEFAULT_TIMEOUT_SECONDS,
    max_attempts: int = DEFAULT_MAX_ATTEMPTS,
    retry_delay_seconds: float = DEFAULT_RETRY_DELAY_SECONDS,
    pipeline_name: str | None = None,
    run_id: str | None = None,
    feed_name: str | None = None,
    target_table: str | None = None,
    operation_name: str | None = None,
    metadata: dict[str, Any] | None = None,
    database: str | None = None,
) -> list[dict[str, Any]]:
    """Fetch all pages for one EIA API v2 dataset route."""
    if not api_key:
        raise RuntimeError("EIA_API_KEY is required for EIA Open Data API requests.")
    if page_size < 1:
        raise ValueError("page_size must be at least 1.")

    data_fields = tuple(data_fields)
    if not data_fields:
        raise ValueError("At least one EIA data field is required.")
    facets = {name: tuple(values) for name, values in (facets or {}).items()}

    endpoint = f"{BASE_URL.rstrip('/')}/{route.strip('/')}/data/"
    parsed_url = urlsplit(endpoint)
    operation = operation_name or route.strip("/")
    offset = 0
    rows: list[dict[str, Any]] = []

    while True:
        params = _build_params(
            api_key=api_key,
            frequency=frequency,
            data_fields=data_fields,
            start=start,
            end=end,
            facets=facets,
            sort_column=sort_column,
            sort_direction=sort_direction,
            page_size=page_size,
            offset=offset,
        )
        payload = _get_json_page(
            endpoint,
            params=params,
            parsed_url=parsed_url,
            timeout=timeout,
            max_attempts=max_attempts,
            retry_delay_seconds=retry_delay_seconds,
            pipeline_name=pipeline_name,
            run_id=run_id,
            feed_name=feed_name,
            target_table=target_table,
            operation_name=operation,
            metadata={
                **(metadata or {}),
                "route": route.strip("/"),
                "frequency": frequency,
                "start": start,
                "end": end,
                "offset": offset,
                "page_size": page_size,
                "sort_column": sort_column,
                "sort_direction": sort_direction,
                "facet_counts": {
                    name: len(tuple(values))
                    for name, values in facets.items()
                },
            },
            database=database,
        )

        response = payload.get("response")
        if not isinstance(response, dict):
            raise RuntimeError("EIA API response missing response object.")

        page_rows = response.get("data")
        if not isinstance(page_rows, list):
            raise RuntimeError("EIA API response missing response.data list.")

        rows.extend(page_rows)
        total = _parse_int(response.get("total"))
        offset += len(page_rows)
        if not page_rows or len(page_rows) < page_size:
            break
        if total is not None and offset >= total:
            break

    return rows


def _build_params(
    *,
    api_key: str,
    frequency: str,
    data_fields: Iterable[str],
    start: str,
    end: str,
    facets: dict[str, Iterable[str]] | None,
    sort_column: str,
    sort_direction: str,
    page_size: int,
    offset: int,
) -> list[tuple[str, str | int]]:
    params: list[tuple[str, str | int]] = [
        ("frequency", frequency),
        ("start", start),
        ("end", end),
        ("sort[0][column]", sort_column),
        ("sort[0][direction]", sort_direction),
        ("length", page_size),
        ("offset", offset),
        ("api_key", api_key),
    ]
    for index, field in enumerate(data_fields):
        params.append((f"data[{index}]", field))
    for facet_name, values in (facets or {}).items():
        for value in values:
            params.append((f"facets[{facet_name}][]", value))
    return params


def _get_json_page(
    url: str,
    *,
    params: list[tuple[str, str | int]],
    parsed_url,
    timeout: int,
    max_attempts: int,
    retry_delay_seconds: float,
    pipeline_name: str | None,
    run_id: str | None,
    feed_name: str | None,
    target_table: str | None,
    operation_name: str,
    metadata: dict[str, Any],
    database: str | None,
) -> dict[str, Any]:
    session = requests.Session()
    last_error: Exception | None = None

    for attempt in range(1, max_attempts + 1):
        started = time.perf_counter()
        response: requests.Response | None = None
        try:
            response = session.get(url, params=params, timeout=timeout)
            elapsed_ms = round((time.perf_counter() - started) * 1000)
            response.raise_for_status()
            payload = response.json()
            if not isinstance(payload, dict):
                raise RuntimeError("EIA API JSON payload was not an object.")

            rows_returned = _rows_returned_from_payload(payload)
            log_api_fetch(
                actor_type="scrape",
                provider="eia",
                pipeline_name=pipeline_name,
                run_id=run_id,
                operation_name=operation_name,
                feed_name=feed_name,
                target_table=target_table,
                method="GET",
                target_host=parsed_url.netloc,
                target_path=parsed_url.path,
                status="success",
                http_status=response.status_code,
                attempt=attempt,
                max_attempts=max_attempts,
                elapsed_ms=elapsed_ms,
                rows_returned=rows_returned,
                metadata={
                    **metadata,
                    "response_total": _response_total_from_payload(payload),
                },
                database=database,
            )
            return payload
        except Exception as exc:
            elapsed_ms = round((time.perf_counter() - started) * 1000)
            last_error = exc
            http_status = response.status_code if response is not None else None
            log_api_fetch(
                actor_type="scrape",
                provider="eia",
                pipeline_name=pipeline_name,
                run_id=run_id,
                operation_name=operation_name,
                feed_name=feed_name,
                target_table=target_table,
                method="GET",
                target_host=parsed_url.netloc,
                target_path=parsed_url.path,
                status="failure",
                http_status=http_status,
                attempt=attempt,
                max_attempts=max_attempts,
                elapsed_ms=elapsed_ms,
                error_type=type(exc).__name__,
                error_message=redact_secrets(str(exc)),
                metadata=metadata,
                database=database,
            )
            if attempt < max_attempts and retry_delay_seconds > 0:
                time.sleep(retry_delay_seconds)

    raise RuntimeError(
        f"EIA request to {parsed_url.path} exhausted {max_attempts} attempts."
    ) from last_error


def _rows_returned_from_payload(payload: dict[str, Any]) -> int | None:
    response = payload.get("response")
    if not isinstance(response, dict):
        return None
    rows = response.get("data")
    if not isinstance(rows, list):
        return None
    return len(rows)


def _response_total_from_payload(payload: dict[str, Any]) -> int | None:
    response = payload.get("response")
    if not isinstance(response, dict):
        return None
    return _parse_int(response.get("total"))


def _parse_int(value: object) -> int | None:
    if value is None:
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None
