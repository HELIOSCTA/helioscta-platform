"""Tomorrow's Meteologica-fed KNN Sunny pipeline."""

from __future__ import annotations

import sys
from datetime import date
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
    from backend.modelling.pjm_da_models.like_day_model_knn_sunny.meteo_rto_hourly.pipelines._shared import (  # type: ignore[import-not-found]
        run_single_day,
    )
else:
    from ._shared import run_single_day


TARGET_DATE: date | None = None
RUN_DATE: date | None = None
HISTORY_DAYS: int = 730
CUTOFF_UTC: str | None = None


def run(
    *,
    target_date: date | str | None = TARGET_DATE,
    run_date: date | str | None = RUN_DATE,
    history_days: int = HISTORY_DAYS,
    pool_start_date: date | str | None = None,
    pool_year_months: dict[int, list[int]] | None = None,
    cutoff_utc: str | None = CUTOFF_UTC,
    feature_group_weights_override: dict[str, float] | None = None,
    quiet: bool = False,
) -> dict[str, object]:
    return run_single_day(
        target_date=target_date,
        run_date=run_date,
        history_days=history_days,
        pool_start_date=pool_start_date,
        pool_year_months=pool_year_months,
        cutoff_utc=cutoff_utc,
        feature_group_weights_override=feature_group_weights_override,
        quiet=quiet,
    )


if __name__ == "__main__":
    from backend.modelling.pjm_da_models._entrypoint import run_entrypoint

    run_entrypoint(
        name="pjm_da_knn_sunny_meteo_tomorrow",
        module_file=__file__,
        runner=run,
    )
