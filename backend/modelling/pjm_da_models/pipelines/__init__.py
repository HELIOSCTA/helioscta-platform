"""Horizon-grouped root entrypoints for PJM DA model runs."""

from __future__ import annotations

from importlib import import_module


_EXPORTS = {
    "run_like_day_knn_sunny_meteo_rto_hourly_next_14_days": (
        ".next_14_days.like_day_knn_sunny_meteo_rto_hourly",
        "run",
    ),
    "run_like_day_knn_sunny_meteo_rto_hourly_next_3_days": (
        ".next_3_days.like_day_knn_sunny_meteo_rto_hourly",
        "run",
    ),
    "run_like_day_knn_sunny_meteo_rto_hourly_tomorrow": (
        ".tomorrow.like_day_knn_sunny_meteo_rto_hourly",
        "run",
    ),
    "run_like_day_knn_sunny_pjm_rto_hourly_tomorrow": (
        ".tomorrow.like_day_knn_sunny_pjm_rto_hourly",
        "run",
    ),
    "run_meteo_baseline_price_meteo_da_price_next_14_days": (
        ".next_14_days.meteo_baseline_price_meteo_da_price",
        "run",
    ),
    "run_meteo_baseline_price_meteo_da_price_next_3_days": (
        ".next_3_days.meteo_baseline_price_meteo_da_price",
        "run",
    ),
    "run_meteo_baseline_price_meteo_da_price_tomorrow": (
        ".tomorrow.meteo_baseline_price_meteo_da_price",
        "run",
    ),
}

__all__ = [
    "run_like_day_knn_sunny_meteo_rto_hourly_next_14_days",
    "run_like_day_knn_sunny_meteo_rto_hourly_next_3_days",
    "run_like_day_knn_sunny_meteo_rto_hourly_tomorrow",
    "run_like_day_knn_sunny_pjm_rto_hourly_tomorrow",
    "run_meteo_baseline_price_meteo_da_price_next_14_days",
    "run_meteo_baseline_price_meteo_da_price_next_3_days",
    "run_meteo_baseline_price_meteo_da_price_tomorrow",
]


def __getattr__(name: str) -> object:
    if name not in _EXPORTS:
        raise AttributeError(f"module {__name__!r} has no attribute {name!r}")
    module_name, attribute = _EXPORTS[name]
    value = getattr(import_module(module_name, __name__), attribute)
    globals()[name] = value
    return value
