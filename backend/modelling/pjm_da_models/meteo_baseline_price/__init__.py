"""Direct-read Meteologica Western Hub DA price baseline model."""

from __future__ import annotations

from importlib import import_module


_EXPORTS = {
    "run_full_prediction_window": (
        "backend.modelling.pjm_da_models.meteo_baseline_price.pipelines."
        "forecast_full_prediction_window",
        "run",
    ),
    "run_latest_horizon": (
        "backend.modelling.pjm_da_models.meteo_baseline_price.pipelines._shared",
        "run_latest_horizon",
    ),
    "run_next_3_days": (
        "backend.modelling.pjm_da_models.pipelines.next_3_days."
        "meteo_baseline_price_meteo_da_price",
        "run",
    ),
    "run_single_day": (
        "backend.modelling.pjm_da_models.meteo_baseline_price.pipelines._shared",
        "run_single_day",
    ),
    "run_tomorrow": (
        "backend.modelling.pjm_da_models.pipelines.tomorrow."
        "meteo_baseline_price_meteo_da_price",
        "run",
    ),
}

__all__ = [
    "run_full_prediction_window",
    "run_latest_horizon",
    "run_next_3_days",
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
