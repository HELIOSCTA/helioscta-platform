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
}
