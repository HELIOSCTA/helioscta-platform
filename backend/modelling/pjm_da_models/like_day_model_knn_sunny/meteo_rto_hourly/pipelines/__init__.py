"""Meteologica-fed KNN Sunny pipeline wrappers."""

from ._shared import run_latest_horizon, run_single_day


def run_tomorrow(*args: object, **kwargs: object) -> dict[str, object]:
    from .forecast_tomorrow import run

    return run(*args, **kwargs)


def run_next_3_days(*args: object, **kwargs: object) -> dict[str, object]:
    from .forecast_next_3_days import run

    return run(*args, **kwargs)


def run_full_prediction_window(
    *args: object,
    **kwargs: object,
) -> dict[str, object]:
    from .forecast_full_prediction_window import run

    return run(*args, **kwargs)

__all__ = [
    "run_full_prediction_window",
    "run_latest_horizon",
    "run_next_3_days",
    "run_single_day",
    "run_tomorrow",
]
