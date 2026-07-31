"""Named pipeline entry points for the Meteologica baseline price model."""

from ._shared import run_latest_horizon, run_single_day
from .forecast_full_prediction_window import run as run_full_prediction_window
from .forecast_next_3_days import run as run_next_3_days
from .forecast_tomorrow import run as run_tomorrow

__all__ = [
    "run_full_prediction_window",
    "run_latest_horizon",
    "run_next_3_days",
    "run_single_day",
    "run_tomorrow",
]
