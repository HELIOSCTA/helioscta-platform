"""ICE Python client helpers for settlement scrapes."""
from __future__ import annotations

import importlib
import logging
import time
from datetime import date, datetime, time as datetime_time, timezone
from typing import Iterable

import pandas as pd
import pytz


DEFAULT_DATE_COLUMN = "trade_date"
DEFAULT_DATE_FORMAT = "%Y-%m-%d"
DEFAULT_GRANULARITY = "D"
MT = pytz.timezone("America/Edmonton")

logger = logging.getLogger(__name__)


def current_trade_date_mst() -> date:
    """Return today's date in Mountain time."""
    return datetime.now(timezone.utc).astimezone(MT).date()


def date_to_datetime(value: date) -> datetime:
    """Return a midnight datetime for an ICE date input."""
    return datetime.combine(value, datetime_time.min)


def get_icepython_module():
    """Import the locally installed ICE Python package."""
    try:
        return importlib.import_module("icepython")
    except ModuleNotFoundError as exc:
        raise ModuleNotFoundError(
            "Local Windows ICE runtime required: install ICE XL, then run "
            "`python infrastructure/windows-task-scheduler/ice_python/"
            "install_ice_python.py` before running backend.scrapes.ice_python "
            "modules."
        ) from exc


def empty_timeseries_frame(
    date_col: str = DEFAULT_DATE_COLUMN,
) -> pd.DataFrame:
    return pd.DataFrame(columns=[date_col, "symbol", "data_type", "value"])


def get_timeseries(
    symbol: str,
    data_type: str,
    granularity: str = DEFAULT_GRANULARITY,
    start_date: datetime | None = None,
    end_date: datetime | None = None,
    date_col: str = DEFAULT_DATE_COLUMN,
    date_format: str = DEFAULT_DATE_FORMAT,
) -> pd.DataFrame:
    """Pull one ICE timeseries field for one symbol."""
    ice = get_icepython_module()
    start_date = start_date or date_to_datetime(current_trade_date_mst())
    end_date = end_date or date_to_datetime(current_trade_date_mst())

    data = ice.get_timeseries(
        symbol,
        data_type,
        granularity=granularity,
        start_date=start_date.strftime(date_format),
        end_date=end_date.strftime(date_format),
    )
    if not data or len(data) <= 1:
        return empty_timeseries_frame(date_col=date_col)

    df = pd.DataFrame(data[1:], columns=[date_col, "value"])
    df["symbol"] = symbol
    df["data_type"] = data_type
    return df


def format_timeseries(
    df: pd.DataFrame,
    date_col: str = DEFAULT_DATE_COLUMN,
    date_format: str = DEFAULT_DATE_FORMAT,
    keep_zeros: bool = False,
) -> pd.DataFrame:
    """Normalize raw ICE timeseries rows."""
    if df.empty:
        return empty_timeseries_frame(date_col=date_col)

    formatted = df.copy()
    formatted[date_col] = pd.to_datetime(
        formatted[date_col],
        format=date_format,
        errors="coerce",
    ).dt.date
    formatted["value"] = pd.to_numeric(formatted["value"], errors="coerce")
    formatted = formatted.dropna(subset=[date_col, "value"])
    if not keep_zeros:
        formatted = formatted[formatted["value"] != 0.0]

    return formatted[[date_col, "symbol", "data_type", "value"]]


def get_timeseries_with_retry(
    symbol: str,
    data_type: str,
    granularity: str = DEFAULT_GRANULARITY,
    start_date: datetime | None = None,
    end_date: datetime | None = None,
    max_retries: int = 3,
    backoff_base: float = 2.0,
) -> pd.DataFrame:
    """Pull a timeseries field with bounded exponential backoff."""
    for attempt in range(1, max_retries + 1):
        try:
            return get_timeseries(
                symbol=symbol,
                data_type=data_type,
                granularity=granularity,
                start_date=start_date,
                end_date=end_date,
            )
        except Exception as exc:
            if attempt < max_retries:
                wait = backoff_base ** attempt
                logger.warning(
                    f"Attempt {attempt}/{max_retries} failed for {symbol}: "
                    f"{exc}. Retrying in {wait:.1f}s..."
                )
                time.sleep(wait)
            else:
                logger.error(f"All {max_retries} attempts failed for {symbol}: {exc}")
    return empty_timeseries_frame()


def combine_frames(frames: Iterable[pd.DataFrame]) -> pd.DataFrame:
    """Concatenate non-empty timeseries frames."""
    materialized = [frame for frame in frames if frame is not None and not frame.empty]
    if not materialized:
        return empty_timeseries_frame()
    return pd.concat(materialized, ignore_index=True)
