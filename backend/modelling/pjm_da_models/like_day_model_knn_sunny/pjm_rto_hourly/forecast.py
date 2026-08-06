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
    from backend.modelling.pjm_da_models.like_day_model_knn_sunny.pjm_rto_hourly import (  # type: ignore[import-not-found]
        metrics as metrics_mod,
    )
else:
    from .. import calendar as sunny_calendar
    from .. import configs
    from . import metrics as metrics_mod
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


def aggregate_quantile_bands_from_analogs(
    analogs: pd.DataFrame,
    quantiles: list[float],
    hour_groups: dict[str, tuple[int, ...]] | None = None,
    n_draws: int = 2000,
    seed: int = 7,
) -> dict[str, dict[float, float]]:
    if hour_groups is None:
        hour_groups = {
            "OnPeak": configs.ONPEAK_HOURS,
            "OffPeak": configs.OFFPEAK_HOURS,
            "Flat": configs.HOURS,
        }
    per_hour: dict[int, tuple[np.ndarray, np.ndarray]] = {}
    for hour in configs.HOURS:
        sub = analogs[analogs["hour_ending"] == hour].dropna(subset=["lmp"])
        if sub.empty:
            continue
        values = sub["lmp"].to_numpy(dtype=float)
        weights = sub["weight"].to_numpy(dtype=float)
        if weights.sum() <= 0:
            continue
        per_hour[hour] = (values, weights / weights.sum())
    return _aggregate_quantile_bands(per_hour, hour_groups, quantiles, n_draws, seed)


def _aggregate_quantile_bands(
    per_hour: dict[int, tuple[np.ndarray, np.ndarray]],
    hour_groups: dict[str, tuple[int, ...]],
    quantiles: list[float],
    n_draws: int,
    seed: int,
) -> dict[str, dict[float, float]]:
    rng = np.random.default_rng(seed)
    output: dict[str, dict[float, float]] = {}
    for label, hours in hour_groups.items():
        usable = [hour for hour in hours if hour in per_hour and len(per_hour[hour][0]) > 0]
        if not usable:
            output[label] = {q: float("nan") for q in quantiles}
            continue
        draws = np.zeros((n_draws, len(usable)), dtype=float)
        for index, hour in enumerate(usable):
            values, weights = per_hour[hour]
            weights = weights / weights.sum()
            pick = rng.choice(len(values), size=n_draws, p=weights)
            draws[:, index] = values[pick]
        aggregate = draws.mean(axis=1)
        output[label] = {q: float(np.quantile(aggregate, q)) for q in quantiles}
    return output


def build_quantiles_table(
    target_date: date,
    df_forecast: pd.DataFrame,
    display_quantiles: list[float] | tuple[float, ...] = tuple(configs.DISPLAY_QUANTILES),
    analogs: pd.DataFrame | None = None,
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

    if analogs is not None and not analogs.empty:
        bands = aggregate_quantile_bands_from_analogs(analogs, list(display_quantiles))
        for row in rows:
            if row["Type"] == "Forecast":
                continue
            try:
                quantile = float(str(row["Type"]).removeprefix("P")) / 100.0
            except ValueError:
                continue
            for label in ("OnPeak", "OffPeak", "Flat"):
                value = bands.get(label, {}).get(quantile)
                if value is not None:
                    row[label] = value
    return pd.DataFrame(rows, columns=columns)


def _normalize_actual_hourly(
    actual_hourly: dict[int, float | None] | None,
) -> dict[int, float] | None:
    if not actual_hourly:
        return None
    output: dict[int, float] = {}
    for hour, value in actual_hourly.items():
        if pd.notna(value):
            output[int(hour)] = float(value)
    return output or None


def _actuals_long(pool: pd.DataFrame, target_date: date) -> dict[int, float] | None:
    if pool.empty or "lmp" not in pool.columns:
        return None
    dates = pd.to_datetime(pool["date"], errors="coerce").dt.date
    sub = pool[dates == target_date]
    if sub.empty:
        return None
    output: dict[int, float] = {}
    for row in sub.itertuples(index=False):
        value = getattr(row, "lmp", None)
        if pd.notna(value):
            output[int(getattr(row, "hour_ending"))] = float(value)
    return output if len(output) >= 12 else None


def _naive_last_week(pool: pd.DataFrame, target_date: date) -> np.ndarray | None:
    last_week = target_date - timedelta(days=7)
    actuals = _actuals_long(pool, last_week)
    if actuals is None:
        return None
    return np.array([actuals.get(hour, np.nan) for hour in configs.HOURS], dtype=float)


def _build_output_table(
    target_date: date,
    df_forecast: pd.DataFrame,
    actual_hourly: dict[int, float] | None,
) -> pd.DataFrame:
    columns = ["Date", "Type", *[f"HE{hour}" for hour in configs.HOURS], "OnPeak", "OffPeak", "Flat"]
    forecast_hourly: dict[int, float] = {}
    if not df_forecast.empty:
        for row in df_forecast.itertuples(index=False):
            value = getattr(row, "point_forecast", None)
            if pd.notna(value):
                forecast_hourly[int(row.hour_ending)] = float(value)

    rows: list[dict[str, object]] = []
    if actual_hourly:
        rows.append(
            _summarize(
                {
                    "Date": target_date,
                    "Type": "Actual",
                    **{f"HE{hour}": actual_hourly.get(hour) for hour in configs.HOURS},
                }
            )
        )

    rows.append(
        _summarize(
            {
                "Date": target_date,
                "Type": "Forecast",
                **{f"HE{hour}": forecast_hourly.get(hour) for hour in configs.HOURS},
            }
        )
    )

    if actual_hourly:
        errors: dict[str, object] = {"Date": target_date, "Type": "Error"}
        for hour in configs.HOURS:
            forecast_value = forecast_hourly.get(hour)
            actual_value = actual_hourly.get(hour)
            errors[f"HE{hour}"] = (
                forecast_value - actual_value
                if forecast_value is not None
                and actual_value is not None
                and pd.notna(forecast_value)
                and pd.notna(actual_value)
                else None
            )
        rows.append(_summarize(errors))

    return pd.DataFrame(rows, columns=columns)


def _evaluate_metrics(
    *,
    pool: pd.DataFrame,
    target_date: date,
    df_forecast: pd.DataFrame,
    actual_hourly: dict[int, float] | None,
    quantiles: list[float],
    y_naive_override: np.ndarray | None,
) -> dict[str, float]:
    if actual_hourly is None or df_forecast.empty:
        return {}

    merged = df_forecast.copy()
    merged["actual_lmp"] = merged["hour_ending"].astype(int).map(actual_hourly)
    merged = merged.dropna(subset=["actual_lmp"])
    if merged.empty:
        return {}

    y_true = merged["actual_lmp"].to_numpy(dtype=float)
    naive_full = y_naive_override if y_naive_override is not None else _naive_last_week(pool, target_date)
    y_naive = (
        naive_full[merged["hour_ending"].astype(int).values - 1]
        if naive_full is not None
        else None
    )
    return metrics_mod.evaluate_forecast(y_true, merged, quantiles, y_naive=y_naive)


def build_strip_row(
    target_date: date,
    df_forecast: pd.DataFrame,
    run_date: date,
    actual_hourly: dict[int, float | None] | None = None,
) -> dict[str, object]:
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

    actual = _normalize_actual_hourly(actual_hourly)
    errors: dict[int, float] = {}
    if actual:
        errors = {
            hour: point[hour] - actual[hour]
            for hour in configs.HOURS
            if hour in point
            and hour in actual
            and pd.notna(point[hour])
            and pd.notna(actual[hour])
        }

    row: dict[str, object] = {
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
    if actual:
        row.update(
            {
                "actual_onpeak": block_mean(actual, configs.ONPEAK_HOURS),
                "actual_offpeak": block_mean(actual, configs.OFFPEAK_HOURS),
                "actual_flat": block_mean(actual, configs.HOURS),
                "error_onpeak": block_mean(errors, configs.ONPEAK_HOURS),
                "error_offpeak": block_mean(errors, configs.OFFPEAK_HOURS),
                "error_flat": block_mean(errors, configs.HOURS),
            }
        )
    return row


def run_forecast(
    *,
    target_date: date,
    query: pd.DataFrame,
    pool: pd.DataFrame,
    config: configs.KnnModelConfig | None = None,
    feature_group_weights_override: dict[str, float] | None = None,
    actual_hourly: dict[int, float | None] | None = None,
    include_pool_actuals: bool = True,
    y_naive_override: np.ndarray | None = None,
    display_quantiles: list[float] | tuple[float, ...] | None = None,
) -> dict[str, object]:
    cfg = config or configs.KnnModelConfig(forecast_date=target_date.isoformat())
    cfg, day_type = cfg.with_day_type_overrides(target_date)
    spec = cfg.resolved_spec()
    quantiles = cfg.resolved_quantiles()
    displayed_quantiles = (
        list(display_quantiles)
        if display_quantiles is not None
        else cfg.resolved_display_quantiles()
    )
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
    quantiles_table = build_quantiles_table(
        target_date,
        df_forecast,
        displayed_quantiles,
        analogs=analogs,
    )
    resolved_actual_hourly = _normalize_actual_hourly(actual_hourly)
    if resolved_actual_hourly is None and include_pool_actuals:
        resolved_actual_hourly = _actuals_long(pool, target_date)
    output_table = _build_output_table(target_date, df_forecast, resolved_actual_hourly)
    metrics = _evaluate_metrics(
        pool=pool,
        target_date=target_date,
        df_forecast=df_forecast,
        actual_hourly=resolved_actual_hourly,
        quantiles=quantiles,
        y_naive_override=y_naive_override,
    )
    target_features_by_hour: dict[int, dict[str, float | None]] = {}
    for hour in configs.HOURS:
        query_rows = query[query["hour_ending"] == hour]
        if query_rows.empty:
            continue
        query_row = query_rows.iloc[0]
        target_features_by_hour[hour] = {
            column: (
                float(query_row[column])
                if column in query_row.index and pd.notna(query_row[column])
                else None
            )
            for column in spec.feature_columns
        }
    return {
        "forecast_date": target_date.isoformat(),
        "reference_date": (target_date - timedelta(days=1)).isoformat(),
        "output_table": output_table,
        "df_forecast": df_forecast,
        "quantiles_table": quantiles_table,
        "analogs": analogs,
        "target_features": query,
        "target_features_by_hour": target_features_by_hour,
        "actual_hourly": resolved_actual_hourly,
        "has_actuals": resolved_actual_hourly is not None,
        "metrics": metrics,
        "n_analogs_used": int(analogs.groupby("hour_ending").size().mean())
        if not analogs.empty
        else 0,
        "feature_weights": effective_weights(spec, feature_group_weights_override),
        "scenario": "hourly_knn_sunny",
        "day_type": day_type,
        "config": cfg,
        "funnel": funnel,
    }
