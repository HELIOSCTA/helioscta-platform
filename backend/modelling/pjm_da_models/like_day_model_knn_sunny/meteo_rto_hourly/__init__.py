"""Meteologica-fed RTO hourly KNN Sunny variant."""

from __future__ import annotations

from importlib import import_module

from .builder import build_horizon_query_rows, build_pool


_EXPORTS = {
    "run_full_prediction_window": (
        "backend.modelling.pjm_da_models.like_day_model_knn_sunny."
        "meteo_rto_hourly.pipelines.forecast_full_prediction_window",
        "run",
    ),
    "run_next_3_days": (
        "backend.modelling.pjm_da_models.pipelines.next_3_days."
        "like_day_knn_sunny_meteo_rto_hourly",
        "run",
    ),
    "run_tomorrow": (
        "backend.modelling.pjm_da_models.pipelines.tomorrow."
        "like_day_knn_sunny_meteo_rto_hourly",
        "run",
    ),
}

__all__ = [
    "build_horizon_query_rows",
    "build_pool",
    "run_full_prediction_window",
    "run_next_3_days",
    "run_tomorrow",
]


def __getattr__(name: str) -> object:
    if name not in _EXPORTS:
        raise AttributeError(f"module {__name__!r} has no attribute {name!r}")
    module_name, attribute = _EXPORTS[name]
    value = getattr(import_module(module_name), attribute)
    globals()[name] = value
    return value
