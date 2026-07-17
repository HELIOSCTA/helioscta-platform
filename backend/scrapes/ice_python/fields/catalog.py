"""Canonical daily settlement table fields."""
from __future__ import annotations

OPEN = "Open"
HIGH = "High"
LOW = "Low"
CLOSE = "Close"
VOLUME = "Volume"
VWAP_CLOSE = "VWAP Close"
SETTLE = "Settle"
SETTLEMENT = "Settlement"
OPEN_INTEREST = "Open Interest"
OPEN_INTEREST_COMPACT = "OpenInterest"

SETTLEMENT_COLUMNS: list[str] = [
    "trade_date",
    "symbol",
    "settlement",
    "open",
    "high",
    "low",
    "close",
    "vwap_close",
    "volume",
    "open_interest",
]

SETTLEMENT_DATA_TYPES: list[str] = [
    "DATE",
    "VARCHAR",
    "FLOAT",
    "FLOAT",
    "FLOAT",
    "FLOAT",
    "FLOAT",
    "FLOAT",
    "FLOAT",
    "FLOAT",
]

SETTLEMENT_PRIMARY_KEY: list[str] = ["trade_date", "symbol"]

ICE_FIELD_TO_COLUMN: dict[str, str] = {
    SETTLE: "settlement",
    SETTLEMENT: "settlement",
    OPEN: "open",
    HIGH: "high",
    LOW: "low",
    CLOSE: "close",
    VWAP_CLOSE: "vwap_close",
    VOLUME: "volume",
    OPEN_INTEREST: "open_interest",
    OPEN_INTEREST_COMPACT: "open_interest",
}
