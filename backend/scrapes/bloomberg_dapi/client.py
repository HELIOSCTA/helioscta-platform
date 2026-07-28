from __future__ import annotations

import importlib
import logging
import time
from contextlib import contextmanager
from datetime import date
from typing import Any, Iterator

import pandas as pd

from backend.scrapes.bloomberg_dapi.config import (
    DEFAULT_EVENT_TIMEOUT_MILLISECONDS,
    DEFAULT_REQUEST_TIMEOUT_SECONDS,
    REFDATA_SERVICE,
)

logger = logging.getLogger(__name__)


class BloombergDependencyError(RuntimeError):
    """Raised when the Bloomberg Python SDK is unavailable."""


class BloombergRequestTimeout(RuntimeError):
    """Raised when Bloomberg does not return a final response in time."""


def _load_blpapi() -> Any:
    try:
        return importlib.import_module("blpapi")
    except ImportError as exc:
        raise BloombergDependencyError(
            "Missing Bloomberg Python SDK. Install it on the licensed Windows "
            "Bloomberg host with: python -m pip install "
            "--index-url=https://blpapi.bloomberg.com/repository/releases/python/simple/ blpapi"
        ) from exc


@contextmanager
def bloomberg_session(
    *,
    host: str,
    port: int,
    service_name: str = REFDATA_SERVICE,
) -> Iterator[Any]:
    """Yield a connected Bloomberg DAPI session."""
    blpapi = _load_blpapi()
    options = blpapi.SessionOptions()
    options.setServerHost(host)
    options.setServerPort(port)

    session = blpapi.Session(options)
    if not session.start():
        raise ConnectionError(
            f"Could not start Bloomberg DAPI session on {host}:{port}. "
            "Confirm Bloomberg Terminal is running and logged in on this host."
        )

    logger.info("Bloomberg DAPI session started on %s:%s", host, port)
    try:
        if not session.openService(service_name):
            raise ConnectionError(f"Could not open Bloomberg service {service_name}")
        logger.info("Opened Bloomberg service %s", service_name)
        yield session
    finally:
        session.stop()
        logger.info("Bloomberg DAPI session stopped")


def fetch_reference_data(
    session: Any,
    securities: list[str],
    fields: list[str],
    *,
    request_timeout_seconds: int = DEFAULT_REQUEST_TIMEOUT_SECONDS,
    event_timeout_milliseconds: int = DEFAULT_EVENT_TIMEOUT_MILLISECONDS,
) -> pd.DataFrame:
    """Send a ReferenceDataRequest and return one row per security."""
    blpapi = _load_blpapi()
    service = session.getService(REFDATA_SERVICE)
    request = service.createRequest("ReferenceDataRequest")

    for security in securities:
        request.getElement("securities").appendValue(security)
    for field in fields:
        request.getElement("fields").appendValue(field)

    session.sendRequest(request)
    logger.info("Sent Bloomberg ReferenceDataRequest for %d securities", len(securities))

    rows: list[dict[str, Any]] = []
    for event_type, message in _iter_response_messages(
        session=session,
        blpapi=blpapi,
        request_timeout_seconds=request_timeout_seconds,
        event_timeout_milliseconds=event_timeout_milliseconds,
    ):
        if event_type not in (blpapi.Event.PARTIAL_RESPONSE, blpapi.Event.RESPONSE):
            continue

        security_data = message.getElement("securityData")
        for i in range(security_data.numValues()):
            security_element = security_data.getValueAsElement(i)
            security = security_element.getElementAsString("security")
            if security_element.hasElement("securityError"):
                logger.warning(
                    "Bloomberg security error for %s: %s",
                    security,
                    security_element.getElement("securityError"),
                )
                continue

            field_data = security_element.getElement("fieldData")
            row: dict[str, Any] = {"security": security}
            for field in fields:
                row[field] = (
                    field_data.getElement(field).getValue()
                    if field_data.hasElement(field)
                    else None
                )
            _log_field_exceptions(security_element, security)
            rows.append(row)

    return pd.DataFrame(rows, columns=["security", *fields])


def fetch_historical_data(
    session: Any,
    securities: list[str],
    fields: list[str],
    start_date: date,
    end_date: date,
    *,
    request_timeout_seconds: int = DEFAULT_REQUEST_TIMEOUT_SECONDS,
    event_timeout_milliseconds: int = DEFAULT_EVENT_TIMEOUT_MILLISECONDS,
) -> pd.DataFrame:
    """Send a HistoricalDataRequest and return one row per security/date."""
    blpapi = _load_blpapi()
    service = session.getService(REFDATA_SERVICE)
    request = service.createRequest("HistoricalDataRequest")

    for security in securities:
        request.getElement("securities").appendValue(security)
    for field in fields:
        request.getElement("fields").appendValue(field)

    request.set("startDate", start_date.strftime("%Y%m%d"))
    request.set("endDate", end_date.strftime("%Y%m%d"))
    request.set("periodicitySelection", "DAILY")

    session.sendRequest(request)
    logger.info(
        "Sent Bloomberg HistoricalDataRequest for %d securities (%s to %s)",
        len(securities),
        start_date,
        end_date,
    )

    rows: list[dict[str, Any]] = []
    for event_type, message in _iter_response_messages(
        session=session,
        blpapi=blpapi,
        request_timeout_seconds=request_timeout_seconds,
        event_timeout_milliseconds=event_timeout_milliseconds,
    ):
        if event_type not in (blpapi.Event.PARTIAL_RESPONSE, blpapi.Event.RESPONSE):
            continue

        security_data = message.getElement("securityData")
        security = security_data.getElementAsString("security")
        if security_data.hasElement("securityError"):
            logger.warning(
                "Bloomberg security error for %s: %s",
                security,
                security_data.getElement("securityError"),
            )
            continue

        field_data = security_data.getElement("fieldData")
        _log_field_exceptions(security_data, security)
        for i in range(field_data.numValues()):
            bar = field_data.getValueAsElement(i)
            row: dict[str, Any] = {
                "security": security,
                "date": pd.Timestamp(bar.getElementAsDatetime("date")).date(),
            }
            for field in fields:
                row[field] = (
                    bar.getElement(field).getValue()
                    if bar.hasElement(field)
                    else None
                )
            rows.append(row)

    return pd.DataFrame(rows, columns=["security", "date", *fields])


def _iter_response_messages(
    *,
    session: Any,
    blpapi: Any,
    request_timeout_seconds: int,
    event_timeout_milliseconds: int,
) -> Iterator[tuple[int, Any]]:
    started = time.monotonic()
    while True:
        elapsed = time.monotonic() - started
        if elapsed > request_timeout_seconds:
            raise BloombergRequestTimeout(
                "Timed out waiting for Bloomberg response after "
                f"{request_timeout_seconds} seconds"
            )

        event = session.nextEvent(event_timeout_milliseconds)
        event_type = event.eventType()
        if event_type == blpapi.Event.TIMEOUT:
            logger.debug("Bloomberg nextEvent timed out; continuing until request ceiling")
            continue

        for message in event:
            yield event_type, message

        if event_type == blpapi.Event.RESPONSE:
            break


def _log_field_exceptions(security_element: Any, security: str) -> None:
    if not security_element.hasElement("fieldExceptions"):
        return

    field_exceptions = security_element.getElement("fieldExceptions")
    for i in range(field_exceptions.numValues()):
        exception = field_exceptions.getValueAsElement(i)
        logger.warning(
            "Bloomberg field exception for %s %s: %s",
            security,
            exception.getElementAsString("fieldId"),
            exception.getElement("errorInfo"),
        )
