"""Compatibility wrapper for tomorrow's Meteologica DA-price baseline."""

from __future__ import annotations

import sys
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

from backend.modelling.pjm_da_models.pipelines.tomorrow.meteo_baseline_price_meteo_da_price import (
    CUTOFF_UTC,
    ENTRYPOINT_NAME,
    HUB,
    INCLUDE_ACTUALS,
    LEAD_DAYS,
    RUN_DATE,
    TARGET_DATE,
    run,
)

__all__ = [
    "CUTOFF_UTC",
    "ENTRYPOINT_NAME",
    "HUB",
    "INCLUDE_ACTUALS",
    "LEAD_DAYS",
    "RUN_DATE",
    "TARGET_DATE",
    "run",
]


if __name__ == "__main__":
    from backend.modelling.pjm_da_models._entrypoint import run_entrypoint

    run_entrypoint(
        name=ENTRYPOINT_NAME,
        module_file=__file__,
        runner=run,
    )
