"""Calendar helpers for the KNN Sunny model."""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from datetime import date

import numpy as np
import pandas as pd


def compute_sunny_calendar_row(d: date, is_nerc_holiday: bool = False) -> dict[str, float]:
    """Return Sunny's Sun=0..Sat=6 calendar feature row."""
    dow_num = (d.weekday() + 1) % 7
    return {
        "day_of_week_number": int(dow_num),
        "is_nerc_holiday": int(bool(is_nerc_holiday)),
        "is_weekend": 1 if dow_num in (0, 6) else 0,
        "dow_sin": float(math.sin(2 * math.pi * dow_num / 7.0)),
        "dow_cos": float(math.cos(2 * math.pi * dow_num / 7.0)),
    }


@dataclass
class FunnelStage:
    name: str
    detail: str
    survives: int
    dropped: int
    relaxed: bool = False
    would_survive: int | None = None


@dataclass
class FunnelCounts:
    stages: list[FunnelStage] = field(default_factory=list)

    def record(
        self,
        name: str,
        detail: str,
        *,
        before: int,
        after: int,
        relaxed: bool = False,
        would_survive: int | None = None,
    ) -> None:
        self.stages.append(
            FunnelStage(
                name=name,
                detail=detail,
                survives=after,
                dropped=max(0, before - after),
                relaxed=relaxed,
                would_survive=would_survive,
            )
        )


def filter_candidates(
    work: pd.DataFrame,
    *,
    target_dow: int,
    target_holiday: int,
    target_weekend: int,
    same_dow_group: bool,
    same_weekend_group: bool,
    same_weekend_group_for_weekends: bool,
    exclude_holidays: bool,
    min_pool_size: int,
    funnel: FunnelCounts | None = None,
) -> tuple[pd.DataFrame, str]:
    if work is None or len(work) == 0:
        return work, "empty"

    if "is_nerc_holiday" in work.columns:
        holiday_mask = (
            work["is_nerc_holiday"] == 1
            if target_holiday
            else work["is_nerc_holiday"] != 1
        )
    else:
        holiday_mask = pd.Series(True, index=work.index)

    candidates: list[tuple[str, pd.DataFrame]] = []
    if same_dow_group and "day_of_week_number" in work.columns:
        exact_dow = work["day_of_week_number"] == target_dow
        if exclude_holidays:
            candidates.append(("exact_dow+holiday", work[exact_dow & holiday_mask]))
        candidates.append(("exact_dow_only", work[exact_dow]))

    apply_weekend = same_weekend_group or (
        same_weekend_group_for_weekends and target_weekend == 1
    )
    if apply_weekend and "is_weekend" in work.columns:
        same_weekend = work["is_weekend"] == target_weekend
        if exclude_holidays:
            candidates.append(("weekend_group+holiday", work[same_weekend & holiday_mask]))
        candidates.append(("weekend_group_only", work[same_weekend]))

    candidates.append(("no_filter", work))
    chosen_name = "no_filter"
    chosen = work
    for stage, frame in candidates:
        if funnel is not None:
            funnel.record(
                f"ladder:{stage}",
                f"size={len(frame)}",
                before=len(work),
                after=len(frame),
                relaxed=len(frame) < min_pool_size,
                would_survive=len(frame) if len(frame) < min_pool_size else None,
            )
        if len(frame) >= min_pool_size:
            chosen = frame
            chosen_name = stage
            break
    return chosen, chosen_name


def linear_age_penalty(
    distances: np.ndarray,
    candidate_dates: pd.Series | np.ndarray | list,
    target_date: date,
    half_life_days: float,
) -> np.ndarray:
    target_ts = pd.Timestamp(target_date)
    dates = pd.to_datetime(pd.Series(list(candidate_dates)))
    age = ((target_ts - dates).dt.days).to_numpy(dtype=float)
    age = np.maximum(age, 0.0)
    half = float(max(half_life_days, 1.0))
    return distances * (1.0 + age / half)
