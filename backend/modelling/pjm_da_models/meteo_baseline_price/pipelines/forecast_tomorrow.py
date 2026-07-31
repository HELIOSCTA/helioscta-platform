"""Tomorrow's Meteologica DA-price baseline pipeline.

Usage:
    python -m backend.modelling.pjm_da_models.meteo_baseline_price.pipelines.forecast_tomorrow
    python backend/modelling/pjm_da_models/meteo_baseline_price/pipelines/forecast_tomorrow.py
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
        run_single_day,
    )
else:
    from ._shared import DEFAULT_HUB, run_single_day

TARGET_DATE: date | None = None
RUN_DATE: date | None = None
HUB: str = DEFAULT_HUB
CUTOFF_UTC: str | None = None
LEAD_DAYS: int | None = 1
INCLUDE_ACTUALS: bool = True


def run(
    *,
    target_date: date | str | None = TARGET_DATE,
    run_date: date | str | None = RUN_DATE,
    hub: str = HUB,
    cutoff_utc: str | None = CUTOFF_UTC,
    lead_days: int | None = LEAD_DAYS,
    include_actuals: bool = INCLUDE_ACTUALS,
    quiet: bool = False,
) -> dict[str, object]:
    """Run the single-day report for tomorrow by default."""
    return run_single_day(
        target_date=target_date,
        run_date=run_date,
        hub=hub,
        cutoff_utc=cutoff_utc,
        lead_days=lead_days,
        include_actuals=include_actuals,
        quiet=quiet,
    )


if __name__ == "__main__":
    from backend.modelling.pjm_da_models._entrypoint import run_entrypoint

    run_entrypoint(
        name="pjm_da_meteo_baseline_price_tomorrow",
        module_file=__file__,
        runner=run,
    )
