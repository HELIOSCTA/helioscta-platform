"""Settings for local ICE trade blotter ingestion."""
from __future__ import annotations

from pathlib import Path


BASE_DIR = Path(__file__).resolve().parent
CSV_DIR = BASE_DIR / "csv"
CSV_INBOX_DIR = CSV_DIR / "inbox"
CSV_FORMATTED_FILES_DIR = CSV_DIR / "formatted_files"
LOG_DIR = BASE_DIR / "logs"
CSV_MANAGER_LOG_DIR = LOG_DIR
TRADE_BLOTTERS_LOG_DIR = LOG_DIR

TARGET_DATABASE: str | None = None

SOURCE_SYSTEM = "ice_trade_blotter_local_file"
SOURCE_REPORT_NAME = "ICE Deal Report"
API_SCRAPE_NAME = "ice_trade_blotters"
CSV_MANAGER_OPERATION_NAME = "ice_trade_blotter_csv_manager"
IMPORT_OPERATION_NAME = "ice_monthly_trade_blotters"

DEFAULT_MONTHLY_TRADE_BLOTTER_FILE = CSV_DIR / "DealReport.xls"

TRADE_BLOTTERS_SCHEMA = "ice_trade_blotter"
TRADE_BLOTTERS_TABLE = "ice_trade_blotter"
TRADE_BLOTTERS_TARGET_TABLE = f"{TRADE_BLOTTERS_SCHEMA}.{TRADE_BLOTTERS_TABLE}"

FILE_MANIFEST_TABLE = "file_manifest"
FILE_MANIFEST_TARGET_TABLE = f"{TRADE_BLOTTERS_SCHEMA}.{FILE_MANIFEST_TABLE}"

LOGGING_SOURCE = SOURCE_SYSTEM
LOGGING_PRIORITY = "high"
LOGGING_TAGS = "trades,ice,trade_blotters"
LOGGING_OPERATION_TYPE = "upsert"
