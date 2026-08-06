"""Next-three-days Meteologica DA-price baseline pipeline."""

from __future__ import annotations

import sys
from datetime import date
from pathlib import Path


def _find_repo_root() -> Path:
    for parent in Path(__file__).resolve().parents:
        if (parent / "backend" / "modelling" / "pjm_da_models").exists():
            return parent
    raise RuntimeError(
        "Could not locate helioscta-platform repo root with "
        "backend/modelling/pjm_da_models."
    )


if __package__ in (None, ""):
    _REPO_ROOT = _find_repo_root()
    if str(_REPO_ROOT) not in sys.path:
        sys.path.insert(0, str(_REPO_ROOT))

from backend.modelling.pjm_da_models.meteo_baseline_price.pipelines._shared import (
    DEFAULT_HUB,
    run_latest_horizon,
)

RUN_DATE: date | None = None
HORIZON_DAYS: int = 3
HUB: str = DEFAULT_HUB
CUTOFF_UTC: str | None = None
INCLUDE_ACTUALS: bool = False
ENTRYPOINT_NAME = "pjm_da_meteo_baseline_price_meteo_da_price_next_3_days"


def run(
    *,
    run_date: date | str | None = RUN_DATE,
    horizon_days: int = HORIZON_DAYS,
    hub: str = HUB,
    cutoff_utc: str | None = CUTOFF_UTC,
    include_actuals: bool = INCLUDE_ACTUALS,
    quiet: bool = False,
) -> dict[str, object]:
    return run_latest_horizon(
        run_date=run_date,
        horizon_days=horizon_days,
        hub=hub,
        cutoff_utc=cutoff_utc,
        include_actuals=include_actuals,
        quiet=quiet,
    )


__all__ = [
    "CUTOFF_UTC",
    "ENTRYPOINT_NAME",
    "HORIZON_DAYS",
    "HUB",
    "INCLUDE_ACTUALS",
    "RUN_DATE",
    "run",
]


if __name__ == "__main__":
    from backend.modelling.pjm_da_models._entrypoint import run_entrypoint

    run_entrypoint(
        name=ENTRYPOINT_NAME,
        module_file=__file__,
        runner=run,
    )
