"""helios_prod-backed PJM DA like-day KNN Sunny model."""

from __future__ import annotations

from importlib import import_module


_EXPORTS = {
    "run_full_prediction_window": (
        "backend.modelling.pjm_da_models.like_day_model_knn_sunny."
        "meteo_rto_hourly.pipelines.forecast_full_prediction_window",
        "run",
    ),
    "run_latest_horizon": (
        "backend.modelling.pjm_da_models.like_day_model_knn_sunny."
        "meteo_rto_hourly.pipelines._shared",
        "run_latest_horizon",
    ),
    "run_next_3_days": (
        "backend.modelling.pjm_da_models.pipelines.next_3_days."
        "like_day_knn_sunny_meteo_rto_hourly",
        "run",
    ),
    "run_pjm_single_day": (
        "backend.modelling.pjm_da_models.like_day_model_knn_sunny."
        "pjm_rto_hourly.pipelines._shared",
        "run_single_day",
    ),
    "run_pjm_tomorrow": (
        "backend.modelling.pjm_da_models.pipelines.tomorrow."
        "like_day_knn_sunny_pjm_rto_hourly",
        "run",
    ),
    "run_single_day": (
        "backend.modelling.pjm_da_models.like_day_model_knn_sunny."
        "meteo_rto_hourly.pipelines._shared",
        "run_single_day",
    ),
    "run_tomorrow": (
        "backend.modelling.pjm_da_models.pipelines.tomorrow."
        "like_day_knn_sunny_meteo_rto_hourly",
        "run",
    ),
}

__all__ = [
    "run_full_prediction_window",
    "run_latest_horizon",
    "run_next_3_days",
    "run_pjm_single_day",
    "run_pjm_tomorrow",
    "run_single_day",
    "run_tomorrow",
]


def __getattr__(name: str) -> object:
    if name not in _EXPORTS:
        raise AttributeError(f"module {__name__!r} has no attribute {name!r}")
    module_name, attribute = _EXPORTS[name]
    value = getattr(import_module(module_name), attribute)
    globals()[name] = value
    return value
