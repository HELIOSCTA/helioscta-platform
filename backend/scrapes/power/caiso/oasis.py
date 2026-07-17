"""Shared CAISO OASIS ZIP/CSV client."""
from __future__ import annotations

from io import BytesIO
import time
from urllib.parse import urlsplit
from zipfile import BadZipFile, ZipFile

import pandas as pd
import requests

from backend.utils.ops_logging import log_api_fetch, redact_secrets


OASIS_SINGLE_ZIP_URL = "https://oasis.caiso.com/oasisapi/SingleZip"
DEFAULT_TIMEOUT_SECONDS = 60
DEFAULT_MAX_ATTEMPTS = 3
DEFAULT_RETRY_DELAY_SECONDS = 5.0


def fetch_single_zip_csv(
    *,
    query_name: str,
    market_run_id: str,
    version: int,
    startdatetime: str,
    enddatetime: str,
    nodes: list[str] | tuple[str, ...],
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
) -> pd.DataFrame:
    """Fetch one CAISO OASIS SingleZip CSV response into a DataFrame."""
    params = {
        "resultformat": "6",
        "queryname": query_name,
        "version": str(version),
        "startdatetime": startdatetime,
        "enddatetime": enddatetime,
        "market_run_id": market_run_id,
        "node": ",".join(nodes),
    }
    parsed_url = urlsplit(OASIS_SINGLE_ZIP_URL)
    operation = operation_name or query_name.lower()
    fetch_metadata = {
        "query_name": query_name,
        "market_run_id": market_run_id,
        "version": version,
        "startdatetime": startdatetime,
        "enddatetime": enddatetime,
        "nodes": list(nodes),
        **(metadata or {}),
    }

    last_error = None
    for attempt in range(1, max_attempts + 1):
        started = time.perf_counter()
        response: requests.Response | None = None
        try:
            response = requests.get(
                OASIS_SINGLE_ZIP_URL,
                params=params,
                headers={"accept": "application/zip,text/csv,*/*"},
                timeout=timeout_seconds,
            )
            elapsed_ms = round((time.perf_counter() - started) * 1000)
            content_type = response.headers.get("Content-Type", "")

            if response.status_code == 200 and _looks_like_zip_response(
                content_type=content_type,
                content=response.content,
            ):
                df, csv_filename = parse_single_zip_csv(response.content)
                if log_fetch:
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
                        rows_returned=len(df),
                        metadata={**fetch_metadata, "csv_filename": csv_filename},
                        database=database,
                    )
                return df

            last_error = (
                f"status={response.status_code}, content_type={content_type}, "
                f"bytes={len(response.content)}"
            )
            if log_fetch:
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
                    max_attempts=max_attempts,
                    error_type="UnexpectedResponse",
                    error_message=last_error,
                    metadata=fetch_metadata,
                    database=database,
                )
        except (requests.RequestException, RuntimeError, BadZipFile) as exc:
            elapsed_ms = round((time.perf_counter() - started) * 1000)
            last_error = str(exc)
            if log_fetch:
                _log_fetch_attempt(
                    parsed_url=parsed_url,
                    pipeline_name=pipeline_name,
                    run_id=run_id,
                    operation_name=operation,
                    feed_name=feed_name,
                    target_table=target_table,
                    status="failure",
                    http_status=response.status_code if response is not None else None,
                    elapsed_ms=elapsed_ms,
                    attempt=attempt,
                    max_attempts=max_attempts,
                    error_type=type(exc).__name__,
                    error_message=redact_secrets(last_error),
                    metadata=fetch_metadata,
                    database=database,
                )

        if attempt < max_attempts:
            delay = _retry_delay_seconds(
                response=response,
                default_delay_seconds=retry_delay_seconds,
            )
            time.sleep(delay)

    raise RuntimeError(
        f"Failed to fetch CAISO OASIS {query_name} after "
        f"{max_attempts} attempts ({last_error})"
    )


def parse_single_zip_csv(content: bytes) -> tuple[pd.DataFrame, str]:
    """Parse the first CSV member from a CAISO OASIS ZIP payload."""
    with ZipFile(BytesIO(content)) as archive:
        csv_entries = [
            entry
            for entry in archive.infolist()
            if not entry.is_dir() and entry.filename.lower().endswith(".csv")
        ]
        if not csv_entries:
            raise RuntimeError("CAISO OASIS ZIP did not contain a CSV file")

        csv_entry = csv_entries[0]
        with archive.open(csv_entry) as csv_file:
            try:
                return pd.read_csv(csv_file), csv_entry.filename
            except pd.errors.EmptyDataError as exc:
                raise RuntimeError(
                    f"CAISO OASIS CSV was empty: {csv_entry.filename}"
                ) from exc


def _looks_like_zip_response(*, content_type: str, content: bytes) -> bool:
    content_type_lower = content_type.lower()
    return "zip" in content_type_lower or content.startswith(b"PK")


def _retry_delay_seconds(
    *,
    response: requests.Response | None,
    default_delay_seconds: float,
) -> float:
    if response is None:
        return default_delay_seconds
    retry_after = response.headers.get("Retry-After")
    if retry_after:
        try:
            return max(default_delay_seconds, float(retry_after))
        except ValueError:
            return default_delay_seconds
    if response.status_code == 429:
        return max(default_delay_seconds, 15.0)
    return default_delay_seconds


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
        provider="caiso",
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
