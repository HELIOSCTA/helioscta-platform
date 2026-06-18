"""Shared settings for local-only ICE Python settlement scrapes."""
from __future__ import annotations

from pathlib import Path


BASE_DIR = Path(__file__).parent
LOG_DIR = BASE_DIR / "logs"

TARGET_DATABASE: str | None = None
SCHEMA = "ice_python"
SETTLEMENTS_TABLE = "settlements"
CONTRACT_DATES_TABLE = "settlement_contract_dates"

LOGGING_SOURCE = "ice_python"
LOGGING_PRIORITY = "high"
LOGGING_TAGS = "ice,ice_python,settlements,pjm"
LOGGING_OPERATION_TYPE = "upsert"
