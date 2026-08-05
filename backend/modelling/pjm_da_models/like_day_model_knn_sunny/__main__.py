"""Run tomorrow's KNN Sunny model forecast."""

from __future__ import annotations

import sys
from pathlib import Path


def _find_repo_root() -> Path:
    for parent in Path(__file__).resolve().parents:
        if (parent / "backend" / "modelling" / "pjm_da_models").exists():
            return parent
    raise RuntimeError("Could not locate helioscta-platform repo root with backend/modelling/pjm_da_models.")


if __package__ in (None, ""):
    _REPO_ROOT = _find_repo_root()
    if str(_REPO_ROOT) not in sys.path:
        sys.path.insert(0, str(_REPO_ROOT))
    from backend.modelling.pjm_da_models.like_day_model_knn_sunny.meteo_rto_hourly.pipelines.forecast_tomorrow import (  # type: ignore[import-not-found]
        run,
    )
else:
    from .meteo_rto_hourly.pipelines.forecast_tomorrow import run


if __name__ == "__main__":
    from backend.modelling.pjm_da_models._entrypoint import run_entrypoint

    run_entrypoint(
        name="pjm_da_like_day_knn_sunny_meteo_rto_hourly_tomorrow",
        module_file=__file__,
        runner=run,
    )
