"""Shared helpers for manual PJM backfill orchestration."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, time, timezone
from typing import Any

import pandas as pd


@dataclass(frozen=True)
class BackfillResult:
    pipeline_name: str
    start_date: date
    end_date: date
    days_requested: int
    rows_processed: int
    status: str
    dry_run: bool = False


def normalize_date(value: date | datetime | str) -> date:
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    return date.fromisoformat(value)


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


def start_of_day(value: date) -> datetime:
    return datetime.combine(value, time.min)


def backfill_metadata(
    *,
    start_date: date,
    end_date: date,
    workflow: str,
    extra: dict[str, Any] | None = None,
) -> dict[str, Any]:
    return {
        "run_mode": "backfill",
        "backfill_workflow": workflow,
        "backfill_start_date": start_date.isoformat(),
        "backfill_end_date": end_date.isoformat(),
        **(extra or {}),
    }


def rows_processed(frame: pd.DataFrame | None) -> int:
    if frame is None:
        return 0
    return int(len(frame))
