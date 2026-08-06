"""Compatibility wrapper for tomorrow's PJM-backed KNN Sunny pipeline."""

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

from backend.modelling.pjm_da_models.pipelines.tomorrow.like_day_knn_sunny_pjm_rto_hourly import (
    CUTOFF_UTC,
    DEFAULT_RECENCY_HALF_LIFE_DAYS,
    ENTRYPOINT_NAME,
    HISTORY_DAYS,
    INCLUDE_ACTUALS,
    INPUT_FAMILY,
    LABEL_SOURCE,
    LOGGER_NAME,
    MIN_POOL_SIZE,
    MODEL_NAME,
    N_ANALOGS,
    PUBLISH,
    RECENCY_HALF_LIFE_DAYS,
    RUN_DATE,
    SEASON_WINDOW_DAYS,
    TARGET_DATE,
    run,
)

__all__ = [
    "CUTOFF_UTC",
    "DEFAULT_RECENCY_HALF_LIFE_DAYS",
    "ENTRYPOINT_NAME",
    "HISTORY_DAYS",
    "INCLUDE_ACTUALS",
    "INPUT_FAMILY",
    "LABEL_SOURCE",
    "LOGGER_NAME",
    "MIN_POOL_SIZE",
    "MODEL_NAME",
    "N_ANALOGS",
    "PUBLISH",
    "RECENCY_HALF_LIFE_DAYS",
    "RUN_DATE",
    "SEASON_WINDOW_DAYS",
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
