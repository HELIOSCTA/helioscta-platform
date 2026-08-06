"""PJM RTO hourly KNN Sunny model components."""

from __future__ import annotations

from importlib import import_module

from .builder import build_pool, build_query_row
from .forecast import run_forecast


_EXPORTS = {
    "run_single_day": (
        "backend.modelling.pjm_da_models.like_day_model_knn_sunny."
        "pjm_rto_hourly.pipelines._shared",
        "run_single_day",
    ),
    "run_tomorrow": (
        "backend.modelling.pjm_da_models.pipelines.tomorrow."
        "like_day_knn_sunny_pjm_rto_hourly",
        "run",
    ),
}

__all__ = [
    "build_pool",
    "build_query_row",
    "run_forecast",
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
