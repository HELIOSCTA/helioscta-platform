"""Forecast aggregation for the KNN Sunny model."""

from __future__ import annotations

import sys
from datetime import date, timedelta
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
    from backend.modelling.pjm_da_models.like_day_model_knn_sunny.pjm_rto_hourly.engine import (  # type: ignore[import-not-found]
        effective_weights,
        find_twins,
    )
else:
    from .. import calendar as sunny_calendar
    from .. import configs
    from .engine import effective_weights, find_twins


def weighted_quantile(values: np.ndarray, weights: np.ndarray, q: float) -> float:
    idx = np.argsort(values)
    sorted_values = values[idx]
    sorted_weights = weights[idx]
    cdf = np.cumsum(sorted_weights)
    cdf = cdf / cdf[-1]
    return float(np.interp(q, cdf, sorted_values))


def hourly_forecast_from_hour_analogs(
    analogs: pd.DataFrame,
    quantiles: list[float],
) -> pd.DataFrame:
    if analogs.empty or not {"hour_ending", "weight", "lmp"}.issubset(analogs.columns):
        return pd.DataFrame()
    rows: list[dict[str, object]] = []
    for hour in configs.HOURS:
        sub = analogs[analogs["hour_ending"] == hour].dropna(subset=["lmp"])
        if sub.empty:
            continue
        values = sub["lmp"].to_numpy(dtype=float)
        weights = sub["weight"].to_numpy(dtype=float)
        if weights.sum() <= 0:
            continue
        weights = weights / weights.sum()
        row: dict[str, object] = {
            "hour_ending": hour,
            "point_forecast": float(np.average(values, weights=weights)),
        }
        for q in quantiles:
            row[f"q_{q:.2f}"] = weighted_quantile(values, weights, q)
        rows.append(row)
    return pd.DataFrame(rows)


def _summarize(row: dict[str, object]) -> dict[str, object]:
    def mean_for(hours: tuple[int, ...]) -> float:
        values = [
            row.get(f"HE{hour}")
            for hour in hours
            if row.get(f"HE{hour}") is not None and not pd.isna(row.get(f"HE{hour}"))
        ]
        return float(np.mean(values)) if values else float("nan")

    row["OnPeak"] = mean_for(configs.ONPEAK_HOURS)
    row["OffPeak"] = mean_for(configs.OFFPEAK_HOURS)
    row["Flat"] = mean_for(configs.HOURS)
    return row


def _quantile_label(q: float) -> str:
    pct = q * 100.0
    if float(pct).is_integer():
        return f"P{int(pct):02d}"
    return f"P{pct:.1f}".rstrip("0").rstrip(".")


def build_quantiles_table(
    target_date: date,
    df_forecast: pd.DataFrame,
    display_quantiles: list[float] | tuple[float, ...] = tuple(configs.DISPLAY_QUANTILES),
) -> pd.DataFrame:
    columns = ["Date", "Type", *[f"HE{hour}" for hour in configs.HOURS], "OnPeak", "OffPeak", "Flat"]
    if df_forecast.empty:
        return pd.DataFrame(columns=columns)
    rows: list[dict[str, object]] = []
    for q in sorted(display_quantiles):
        column = f"q_{q:.2f}"
        if column not in df_forecast.columns:
            continue
        row: dict[str, object] = {"Date": target_date, "Type": _quantile_label(q)}
        for _, forecast_row in df_forecast.iterrows():
            row[f"HE{int(forecast_row['hour_ending'])}"] = (
                float(forecast_row[column])
                if pd.notna(forecast_row[column])
                else None
            )
        rows.append(_summarize(row))

    forecast_row = {"Date": target_date, "Type": "Forecast"}
    for _, row in df_forecast.iterrows():
        forecast_row[f"HE{int(row['hour_ending'])}"] = (
            float(row["point_forecast"])
            if pd.notna(row.get("point_forecast"))
            else None
        )
    forecast_row = _summarize(forecast_row)
    insert_at = next((i for i, row in enumerate(rows) if row["Type"] == "P50"), len(rows) // 2)
    rows.insert(insert_at + 1, forecast_row)
    return pd.DataFrame(rows, columns=columns)


def build_strip_row(target_date: date, df_forecast: pd.DataFrame, run_date: date) -> dict[str, object]:
    if df_forecast.empty:
        point: dict[int, float] = {}
        q10: dict[int, float] = {}
        q90: dict[int, float] = {}
    else:
        hours = df_forecast["hour_ending"].astype(int)
        point = dict(zip(hours, df_forecast["point_forecast"].astype(float)))
        q10 = (
            dict(zip(hours, df_forecast["q_0.10"].astype(float)))
            if "q_0.10" in df_forecast.columns
            else {}
        )
        q90 = (
            dict(zip(hours, df_forecast["q_0.90"].astype(float)))
            if "q_0.90" in df_forecast.columns
            else {}
        )

    def block_mean(values_by_hour: dict[int, float], hours: tuple[int, ...]) -> float:
        values = [
            values_by_hour[hour]
            for hour in hours
            if hour in values_by_hour and pd.notna(values_by_hour[hour])
        ]
        return float(np.mean(values)) if values else float("nan")

    return {
        "target_date": target_date.isoformat(),
        "lead": (target_date - run_date).days,
        "dow": target_date.strftime("%a"),
        "onpeak": block_mean(point, configs.ONPEAK_HOURS),
        "offpeak": block_mean(point, configs.OFFPEAK_HOURS),
        "flat": block_mean(point, configs.HOURS),
        "p10_onpeak": block_mean(q10, configs.ONPEAK_HOURS),
        "p90_onpeak": block_mean(q90, configs.ONPEAK_HOURS),
        "n_he": int(sum(1 for value in point.values() if pd.notna(value))),
    }


def run_forecast(
    *,
    target_date: date,
    query: pd.DataFrame,
    pool: pd.DataFrame,
    config: configs.KnnModelConfig | None = None,
    feature_group_weights_override: dict[str, float] | None = None,
) -> dict[str, object]:
    cfg = config or configs.KnnModelConfig(forecast_date=target_date.isoformat())
    spec = cfg.resolved_spec()
    quantiles = cfg.resolved_quantiles()
    funnel = sunny_calendar.FunnelCounts()
    analogs = find_twins(
        query=query,
        pool=pool,
        target_date=target_date,
        spec=spec,
        n_analogs=cfg.n_analogs,
        season_window_days=cfg.season_window_days,
        min_pool_size=cfg.min_pool_size,
        same_dow_group=cfg.same_dow_group,
        same_weekend_group=cfg.same_weekend_group,
        same_weekend_group_for_weekends=cfg.same_weekend_group_for_weekends,
        exclude_holidays=cfg.exclude_holidays,
        exclude_dates=cfg.exclude_dates or [],
        recency_half_life_days=cfg.recency_half_life_days,
        feature_group_weights_override=feature_group_weights_override,
        funnel=funnel,
    )
    df_forecast = hourly_forecast_from_hour_analogs(analogs, quantiles)
    quantiles_table = build_quantiles_table(target_date, df_forecast)
    return {
        "forecast_date": target_date.isoformat(),
        "reference_date": (target_date - timedelta(days=1)).isoformat(),
        "df_forecast": df_forecast,
        "quantiles_table": quantiles_table,
        "analogs": analogs,
        "target_features": query,
        "n_analogs_used": int(analogs.groupby("hour_ending").size().mean())
        if not analogs.empty
        else 0,
        "feature_weights": effective_weights(spec, feature_group_weights_override),
        "funnel": funnel,
    }
