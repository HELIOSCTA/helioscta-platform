"""Shared helpers for manual weather backfills."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, time, timezone
from typing import Any

import pandas as pd


@dataclass(frozen=True)
class WeatherBackfillResult:
    pipeline_name: str
    rows_processed: int
    status: str
    region: str
    dry_run: bool = False
    start_date: date | None = None
    end_date: date | None = None
    days_requested: int | None = None
    hours_requested: int | None = None


def normalize_date(value: date | datetime | str) -> date:
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    return date.fromisoformat(value)


def start_of_day(value: date) -> datetime:
    return datetime.combine(value, time.min)


def validate_backfill_window(
    *,
    start_date: date,
    end_date: date,
    max_days: int,
    allow_future: bool = False,
    today: date | None = None,
) -> int:
    if max_days < 1:
        raise ValueError("max_days must be at least 1.")
    if start_date > end_date:
        raise ValueError("start_date must be on or before end_date.")

    today = today or datetime.now(timezone.utc).date()
    if not allow_future and end_date > today:
        raise ValueError(
            "Backfill end_date cannot be in the future unless allow_future=True."
        )

    days_requested = (end_date - start_date).days + 1
    if days_requested > max_days:
        raise ValueError(
            f"Backfill window is {days_requested} days; max_days is {max_days}."
        )
    return days_requested


def validate_lookback_hours(*, hours: int, max_hours: int) -> int:
    if max_hours < 1:
        raise ValueError("max_hours must be at least 1.")
    if hours < 1:
        raise ValueError("hours must be at least 1.")
    if hours > max_hours:
        raise ValueError(f"hours is {hours}; max_hours is {max_hours}.")
    return hours


def backfill_metadata(
    *,
    workflow: str,
    extra: dict[str, Any] | None = None,
) -> dict[str, Any]:
    return {
        "run_mode": "backfill",
        "backfill_workflow": workflow,
        **(extra or {}),
    }


def rows_processed(frame: pd.DataFrame | None) -> int:
    if frame is None:
        return 0
    return int(len(frame))
