"""ICE contract-date helpers for settlement symbols."""
from __future__ import annotations

import logging
import time
from datetime import date

import pandas as pd

from backend.scrapes.ice_python import ice_client


CONTRACT_DATE_FIELDS: list[str] = ["Strip", "Startdt", "Enddt"]
FIELD_TO_COLUMN: dict[str, str] = {
    "Strip": "strip",
    "Startdt": "start_date",
    "Enddt": "end_date",
}

CONTRACT_DATES_COLUMNS: list[str] = [
    "trade_date",
    "symbol",
    "strip",
    "start_date",
    "end_date",
]
CONTRACT_DATES_DATA_TYPES: list[str] = [
    "DATE",
    "VARCHAR",
    "VARCHAR",
    "DATE",
    "DATE",
]
CONTRACT_DATES_PRIMARY_KEY: list[str] = ["trade_date", "symbol"]

QUOTES_MAX_SYMBOLS_PER_REQUEST = 500

logger = logging.getLogger(__name__)


def empty_contract_dates_frame() -> pd.DataFrame:
    """Return an empty DataFrame with the contract-date schema."""
    return pd.DataFrame(columns=CONTRACT_DATES_COLUMNS)


def chunk_symbols(
    symbols: list[str],
    chunk_size: int = QUOTES_MAX_SYMBOLS_PER_REQUEST,
) -> list[list[str]]:
    return [
        symbols[index : index + chunk_size]
        for index in range(0, len(symbols), chunk_size)
    ]


def get_contract_dates_snapshot(
    symbols: list[str],
    max_retries: int = 3,
    backoff_base: float = 2.0,
) -> list:
    """Fetch contract-date metadata via ICE get_quotes."""
    ice = ice_client.get_icepython_module()
    all_results: list = []
    for chunk in chunk_symbols(symbols):
        result = get_contract_dates_chunk_with_retry(
            ice=ice,
            symbols=chunk,
            max_retries=max_retries,
            backoff_base=backoff_base,
        )
        if result:
            all_results.extend(result if not all_results else result[1:])
    return all_results


def get_contract_dates_chunk_with_retry(
    ice,
    symbols: list[str],
    max_retries: int = 3,
    backoff_base: float = 2.0,
) -> list:
    """Fetch one chunk of contract-date metadata with retry."""
    for attempt in range(1, max_retries + 1):
        try:
            data = ice.get_quotes(symbols, CONTRACT_DATE_FIELDS)
            if data:
                return data
            logger.warning(
                "get_quotes contract dates returned empty "
                f"(attempt {attempt}/{max_retries})"
            )
        except Exception as exc:
            logger.warning(
                "get_quotes contract dates attempt "
                f"{attempt}/{max_retries} failed: {exc}"
            )
        if attempt < max_retries:
            wait = backoff_base ** attempt
            logger.info(f"Retrying in {wait:.1f}s...")
            time.sleep(wait)

    logger.error(f"All {max_retries} get_quotes contract-date attempts failed")
    return []


def format_contract_dates(
    raw_data: list,
    trade_date: date | None = None,
) -> pd.DataFrame:
    """Parse raw get_quotes output into contract-date rows."""
    if not raw_data or len(raw_data) <= 1:
        return empty_contract_dates_frame()

    trade_date = trade_date or ice_client.current_trade_date_mst()
    header = raw_data[0]
    rows = raw_data[1:]

    df = pd.DataFrame(rows, columns=header)
    first_col = df.columns[0]
    df = df.rename(columns={first_col: "symbol"})
    df = df.rename(columns=FIELD_TO_COLUMN)
    df["trade_date"] = trade_date
    df["start_date"] = pd.to_datetime(df["start_date"], errors="coerce").dt.date
    df["end_date"] = pd.to_datetime(df["end_date"], errors="coerce").dt.date
    df = df.dropna(subset=["symbol", "start_date", "end_date"])

    return (
        df[CONTRACT_DATES_COLUMNS]
        .sort_values(CONTRACT_DATES_PRIMARY_KEY)
        .reset_index(drop=True)
    )
