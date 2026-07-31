"""Next-three-days Meteologica DA-price baseline pipeline.

Usage:
    python -m backend.modelling.pjm_da_models.meteo_baseline_price.pipelines.forecast_next_3_days
    python backend/modelling/pjm_da_models/meteo_baseline_price/pipelines/forecast_next_3_days.py
"""

from __future__ import annotations

import sys
from datetime import date
from pathlib import Path

if __package__ in (None, ""):
    _REPO_ROOT = Path(__file__).resolve().parents[5]
    if str(_REPO_ROOT) not in sys.path:
        sys.path.insert(0, str(_REPO_ROOT))
    from backend.modelling.pjm_da_models.meteo_baseline_price.pipelines._shared import (  # type: ignore[import-not-found]
        DEFAULT_HUB,
        run_latest_horizon,
    )
else:
    from ._shared import DEFAULT_HUB, run_latest_horizon

RUN_DATE: date | None = None
HORIZON_DAYS: int = 3
HUB: str = DEFAULT_HUB
CUTOFF_UTC: str | None = None


def run(
    *,
    run_date: date | str | None = RUN_DATE,
    horizon_days: int = HORIZON_DAYS,
    hub: str = HUB,
    cutoff_utc: str | None = CUTOFF_UTC,
    quiet: bool = False,
) -> dict[str, object]:
    """Run the forward OnPeak summary for the next three delivery days."""
    return run_latest_horizon(
        run_date=run_date,
        horizon_days=horizon_days,
        hub=hub,
        cutoff_utc=cutoff_utc,
        quiet=quiet,
    )


if __name__ == "__main__":
    from backend.modelling.pjm_da_models._entrypoint import run_entrypoint

    run_entrypoint(
        name="pjm_da_meteo_baseline_price_next_3_days",
        module_file=__file__,
        runner=run,
    )
