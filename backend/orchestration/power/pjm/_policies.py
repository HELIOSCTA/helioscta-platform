"""Reusable tenacity policies for PJM orchestration wrappers."""
import logging

import requests
from tenacity import (
    before_sleep_log,
    retry,
    retry_if_exception_type,
    stop_after_delay,
    stop_after_attempt,
    wait_exponential_jitter,
    wait_fixed,
)

logger = logging.getLogger("orchestration.power.pjm")


class DataNotYetAvailable(Exception):
    """Raised when the PJM API returns a successful but empty response."""


API_TRANSIENT = (
    DataNotYetAvailable,
    requests.ConnectionError,
    requests.Timeout,
    ConnectionResetError,
)


def api_poll_policy(max_seconds: int = 7_200, wait_seconds: int = 10):
    """Poll-until-available with fixed wait between attempts.

    Workflows pass feed-specific ceilings and wait intervals. Time-critical
    publication gates such as DA LMPs should still use bounded minute-level
    polling, while less urgent feeds can use wider intervals so they do not
    compete for HTTP or worker capacity.
    """
    return retry(
        stop=stop_after_delay(max_seconds),
        wait=wait_fixed(wait_seconds),
        retry=retry_if_exception_type(API_TRANSIENT),
        before_sleep=before_sleep_log(logger, logging.WARNING),
        reraise=True,
    )


def api_transient_retry_policy(attempts: int = 3):
    """Short retry on transient HTTP / network errors. No polling.

    Use this around the download+upsert phase, AFTER the poll phase has
    confirmed data is available.
    """
    return retry(
        stop=stop_after_attempt(attempts),
        wait=wait_exponential_jitter(initial=10, max=120),
        retry=retry_if_exception_type(
            (requests.ConnectionError, requests.Timeout, ConnectionResetError)
        ),
        before_sleep=before_sleep_log(logger, logging.WARNING),
        reraise=True,
    )
