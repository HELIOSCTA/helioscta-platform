"""Scalar per-hour KNN engine for the KNN Sunny model."""

from __future__ import annotations

import sys
from datetime import date
from pathlib import Path

import numpy as np
import pandas as pd


def _find_repo_root() -> Path:
    for parent in Path(__file__).resolve().parents:
        if (parent / "backend" / "modelling" / "pjm_da_models").exists():
            return parent
    raise RuntimeError("Could not locate helioscta-platform repo root with backend/modelling/pjm_da_models.")


if __package__ in (None, ""):
    _REPO_ROOT = _find_repo_root()
    if str(_REPO_ROOT) not in sys.path:
        sys.path.insert(0, str(_REPO_ROOT))
    from backend.modelling.pjm_da_models.like_day_model_knn_sunny import (  # type: ignore[import-not-found]
        calendar as sunny_calendar,
    )
    from backend.modelling.pjm_da_models.like_day_model_knn_sunny import configs  # type: ignore[import-not-found]
    from backend.modelling.pjm_da_models.like_day_model_knn_sunny.configs import (  # type: ignore[import-not-found]
        ModelSpec,
    )
else:
    from .. import calendar as sunny_calendar
    from .. import configs
    from ..configs import ModelSpec


def _circular_doy_distance(doy: np.ndarray, target_doy: int) -> np.ndarray:
    direct = np.abs(doy - float(target_doy))
    return np.minimum(direct, 366.0 - direct)


def _fit_zscore(values: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    valid = ~np.isnan(values)
    counts = valid.sum(axis=0).astype(float)
    safe = np.where(valid, values, 0.0)
    means = safe.sum(axis=0) / np.where(counts == 0.0, 1.0, counts)
    means = np.where(counts == 0.0, 0.0, means)
    centered = np.where(valid, values - means, 0.0)
    variances = (centered**2).sum(axis=0) / np.where(counts == 0.0, 1.0, counts)
    stds = np.sqrt(variances)
    stds = np.where((stds == 0.0) | (counts == 0.0) | np.isnan(stds), 1.0, stds)
    return means, stds


def _nan_aware_distance(query_z: np.ndarray, pool_z: np.ndarray) -> np.ndarray:
    diff = pool_z - query_z[np.newaxis, :]
    valid = ~np.isnan(diff)
    sq = np.where(valid, diff**2, 0.0)
    n_valid = valid.sum(axis=1).astype(float)
    out = np.full(len(pool_z), np.nan, dtype=float)
    has_valid = n_valid > 0
    out[has_valid] = np.sqrt(sq[has_valid].sum(axis=1))
    return out


def effective_weights(
    spec: ModelSpec,
    override: dict[str, float] | None = None,
) -> dict[str, float]:
    if override is None:
        return spec.feature_group_weights
    valid = set(spec.feature_groups)
    bad = set(override) - valid
    if bad:
        raise ValueError(f"Unknown weight override keys: {sorted(bad)}")
    raw = dict(spec.raw_feature_group_weights)
    raw.update({key: float(value) for key, value in override.items()})
    total = sum(raw.values())
    if total <= 0:
        raise ValueError("Feature-group weights must sum to a positive value.")
    return {key: value / total for key, value in raw.items()}


def find_twins(
    *,
    query: pd.DataFrame,
    pool: pd.DataFrame,
    target_date: date,
    spec: ModelSpec,
    n_analogs: int = configs.DEFAULT_N_ANALOGS,
    season_window_days: int = configs.SEASON_WINDOW_DAYS,
    min_pool_size: int = configs.MIN_POOL_SIZE,
    same_dow_group: bool = False,
    same_weekend_group: bool = False,
    same_weekend_group_for_weekends: bool = False,
    exclude_holidays: bool = False,
    exclude_dates: list[str] | None = None,
    recency_half_life_days: float = configs.RECENCY_HALF_LIFE_DAYS,
    feature_group_weights_override: dict[str, float] | None = None,
    funnel: sunny_calendar.FunnelCounts | None = None,
) -> pd.DataFrame:
    out_cols = ["hour_ending", "rank", "date", "distance", "weight", "lmp"]
    weights = effective_weights(spec, feature_group_weights_override)
    work_all = pool.copy()
    work_all["date"] = pd.to_datetime(work_all["date"]).dt.date
    work_all = work_all[work_all["lmp"].notna()].copy()

    if exclude_dates:
        drop_set = {pd.to_datetime(value).date() for value in exclude_dates}
        work_all = work_all[~work_all["date"].isin(drop_set)].copy()

    if funnel is not None:
        funnel.record(
            "raw history",
            f"build_pool: {len(work_all)} rows",
            before=len(work_all),
            after=len(work_all),
        )

    rows: list[dict[str, object]] = []
    for hour in configs.HOURS:
        q_rows = query[query["hour_ending"] == hour]
        if q_rows.empty:
            continue
        q_row = q_rows.iloc[0]
        work = work_all[
            (work_all["hour_ending"] == hour) & (work_all["date"] < target_date)
        ].copy()
        if work.empty:
            continue

        if season_window_days > 0:
            target_doy = pd.Timestamp(target_date).dayofyear
            doys = pd.to_datetime(work["date"]).dt.dayofyear.to_numpy(dtype=float)
            keep = _circular_doy_distance(doys, target_doy) <= float(season_window_days)
            work = work[keep]
            if work.empty:
                continue

        chosen, _stage = sunny_calendar.filter_candidates(
            work,
            target_dow=int(q_row.get("day_of_week_number", 0)),
            target_holiday=int(q_row.get("is_nerc_holiday", 0)),
            target_weekend=int(q_row.get("is_weekend", 0)),
            same_dow_group=same_dow_group,
            same_weekend_group=same_weekend_group,
            same_weekend_group_for_weekends=same_weekend_group_for_weekends,
            exclude_holidays=exclude_holidays,
            min_pool_size=min_pool_size,
            funnel=funnel,
        )
        if chosen is None or chosen.empty:
            continue

        n = len(chosen)
        weighted_sum = np.zeros(n, dtype=float)
        weight_sum = np.zeros(n, dtype=float)
        for group_name, columns in spec.feature_groups.items():
            group_weight = float(weights.get(group_name, 0.0))
            if group_weight <= 0:
                continue
            present = [c for c in columns if c in chosen.columns and c in q_row.index]
            if not present:
                continue
            pool_vals = chosen[present].to_numpy(dtype=float)
            query_vals = np.asarray([q_row[c] for c in present], dtype=float)
            means, stds = _fit_zscore(pool_vals)
            distances = _nan_aware_distance(
                (query_vals - means) / stds,
                (pool_vals - means) / stds,
            )
            finite = np.isfinite(distances)
            weighted_sum[finite] += group_weight * distances[finite]
            weight_sum[finite] += group_weight

        distances = np.full(n, np.inf, dtype=float)
        valid = weight_sum > 0
        distances[valid] = weighted_sum[valid] / weight_sum[valid]
        distances = sunny_calendar.linear_age_penalty(
            distances,
            chosen["date"].to_list(),
            target_date,
            recency_half_life_days,
        )

        chosen_local = chosen.copy()
        chosen_local["distance"] = distances
        chosen_local = chosen_local[np.isfinite(chosen_local["distance"])]
        chosen_local = chosen_local.sort_values(["distance", "date"]).head(
            int(n_analogs)
        )
        if chosen_local.empty:
            continue

        raw_distances = chosen_local["distance"].to_numpy(dtype=float)
        inv = 1.0 / np.square(np.maximum(raw_distances, 1e-8))
        analog_weights = inv / inv.sum()
        for rank, (_, row) in enumerate(chosen_local.iterrows(), start=1):
            rows.append(
                {
                    "hour_ending": hour,
                    "rank": rank,
                    "date": row["date"],
                    "distance": float(row["distance"]),
                    "weight": float(analog_weights[rank - 1]),
                    "lmp": float(row["lmp"]) if pd.notna(row.get("lmp")) else np.nan,
                }
            )

    return pd.DataFrame(rows, columns=out_cols)
