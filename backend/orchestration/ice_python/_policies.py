"""Reusable retry policies for local ICE settlement orchestration."""
from __future__ import annotations

import logging

from tenacity import (
    before_sleep_log,
    retry,
    retry_if_exception_type,
    stop_after_attempt,
    wait_exponential_jitter,
)


logger = logging.getLogger("backend.orchestration.ice_python")

ICE_TRANSIENT_EXCEPTIONS: tuple[type[BaseException], ...] = (
    OSError,
    RuntimeError,
    ConnectionError,
    TimeoutError,
)


def ice_transient_retry_policy(attempts: int = 2):
    """Retry narrow ICE cold-start and transport failures."""
    return retry(
        stop=stop_after_attempt(attempts),
        wait=wait_exponential_jitter(initial=10, max=120),
        retry=retry_if_exception_type(ICE_TRANSIENT_EXCEPTIONS),
        before_sleep=before_sleep_log(logger, logging.WARNING),
        reraise=True,
    )
