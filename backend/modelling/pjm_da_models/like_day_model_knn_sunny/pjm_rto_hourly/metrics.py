"""Forecast evaluation metrics for KNN Sunny outputs."""

from __future__ import annotations

import numpy as np
import pandas as pd


def rmae(y_true: np.ndarray, y_pred: np.ndarray, y_naive: np.ndarray) -> float:
    model_mae = float(np.mean(np.abs(y_true - y_pred)))
    naive_mae = float(np.mean(np.abs(y_true - y_naive)))
    return float("inf") if naive_mae == 0 else model_mae / naive_mae


def mae(y_true: np.ndarray, y_pred: np.ndarray) -> float:
    return float(np.mean(np.abs(y_true - y_pred)))


def rmse(y_true: np.ndarray, y_pred: np.ndarray) -> float:
    return float(np.sqrt(np.mean((y_true - y_pred) ** 2)))


def mape(y_true: np.ndarray, y_pred: np.ndarray) -> float:
    mask = y_true != 0
    if not np.any(mask):
        return float("nan")
    return float(np.mean(np.abs((y_true[mask] - y_pred[mask]) / y_true[mask])) * 100)


def coverage(y_true: np.ndarray, lower: np.ndarray, upper: np.ndarray) -> float:
    return float(np.mean((y_true >= lower) & (y_true <= upper)))


def sharpness(lower: np.ndarray, upper: np.ndarray) -> float:
    return float(np.mean(upper - lower))


def crps(y_true: np.ndarray, y_pred_df: pd.DataFrame, quantiles: list[float]) -> float:
    losses: list[tuple[float, float]] = []
    for q in quantiles:
        column = f"q_{q:.2f}"
        if column not in y_pred_df.columns:
            continue
        delta = y_true - y_pred_df[column].to_numpy(dtype=float)
        loss = float(np.mean(np.maximum(q * delta, (q - 1) * delta)))
        losses.append((q, loss))
    if len(losses) < 2:
        return float("nan")
    losses.sort(key=lambda item: item[0])
    return float(np.trapz([item[1] for item in losses], [item[0] for item in losses]))


def evaluate_forecast(
    y_true: np.ndarray,
    y_pred_df: pd.DataFrame,
    quantiles: list[float],
    *,
    y_naive: np.ndarray | None = None,
) -> dict[str, float]:
    output: dict[str, float] = {}
    if "point_forecast" in y_pred_df.columns:
        y_point = y_pred_df["point_forecast"].to_numpy(dtype=float)
    elif "q_0.50" in y_pred_df.columns:
        y_point = y_pred_df["q_0.50"].to_numpy(dtype=float)
    else:
        y_point = None

    if y_point is not None:
        output["mae"] = mae(y_true, y_point)
        output["rmse"] = rmse(y_true, y_point)
        output["mape"] = mape(y_true, y_point)
        if y_naive is not None:
            output["rmae"] = rmae(y_true, y_point, y_naive)

    output["crps"] = crps(y_true, y_pred_df, quantiles)
    for name, lower_q, upper_q in (
        ("80pct", 0.10, 0.90),
        ("90pct", 0.05, 0.95),
        ("98pct", 0.01, 0.99),
    ):
        lower_col = f"q_{lower_q:.2f}"
        upper_col = f"q_{upper_q:.2f}"
        if lower_col not in y_pred_df.columns or upper_col not in y_pred_df.columns:
            continue
        lower = y_pred_df[lower_col].to_numpy(dtype=float)
        upper = y_pred_df[upper_col].to_numpy(dtype=float)
        output[f"coverage_{name}"] = coverage(y_true, lower, upper)
        output[f"sharpness_{name}"] = sharpness(lower, upper)
    return output
