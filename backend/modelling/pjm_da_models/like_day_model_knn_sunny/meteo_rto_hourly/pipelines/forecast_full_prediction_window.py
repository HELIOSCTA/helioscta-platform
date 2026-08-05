"""Full prediction-window Meteologica-fed KNN Sunny pipeline."""

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
        run_latest_horizon,
    )
else:
    from ._shared import run_latest_horizon


RUN_DATE: date | None = None
HORIZON_DAYS: int | None = None
HISTORY_DAYS: int = 730
CUTOFF_UTC: str | None = None
INCLUDE_ACTUALS: bool = True
PER_DAY_DETAIL: bool = False
USE_DAY_TYPE_PROFILES: bool = False


def run(
    *,
    run_date: date | str | None = RUN_DATE,
    horizon_days: int | None = HORIZON_DAYS,
    history_days: int = HISTORY_DAYS,
    pool_start_date: date | str | None = None,
    pool_year_months: dict[int, list[int]] | None = None,
    cutoff_utc: str | None = CUTOFF_UTC,
    feature_group_weights_override: dict[str, float] | None = None,
    include_actuals: bool = INCLUDE_ACTUALS,
    per_day_detail: bool = PER_DAY_DETAIL,
    use_day_type_profiles: bool = USE_DAY_TYPE_PROFILES,
    quiet: bool = False,
) -> dict[str, object]:
    return run_latest_horizon(
        run_date=run_date,
        horizon_days=horizon_days,
        history_days=history_days,
        pool_start_date=pool_start_date,
        pool_year_months=pool_year_months,
        cutoff_utc=cutoff_utc,
        feature_group_weights_override=feature_group_weights_override,
        include_actuals=include_actuals,
        per_day_detail=per_day_detail,
        use_day_type_profiles=use_day_type_profiles,
        quiet=quiet,
    )


if __name__ == "__main__":
    from backend.modelling.pjm_da_models._entrypoint import run_entrypoint

    run_entrypoint(
        name="pjm_da_like_day_knn_sunny_meteo_rto_hourly_full_window",
        module_file=__file__,
        runner=run,
    )
