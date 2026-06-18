"""Curated ICE field presets by settlement product family."""
from __future__ import annotations

from backend.scrapes.ice_python.fields.catalog import (
    CLOSE,
    HIGH,
    LOW,
    OPEN,
    SETTLE,
    VOLUME,
    VWAP_CLOSE,
)


DEFAULT_SETTLEMENT_FIELDS: list[str] = [
    SETTLE,
    OPEN,
    HIGH,
    LOW,
    CLOSE,
    VWAP_CLOSE,
    VOLUME,
]

PJM_SHORT_TERM_FIELDS = DEFAULT_SETTLEMENT_FIELDS
