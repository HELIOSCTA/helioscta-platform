"""Tomorrow's Meteologica-fed KNN Sunny pipeline."""

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

from backend.modelling.pjm_da_models.like_day_model_knn_sunny.meteo_rto_hourly.pipelines._shared import (
    DEFAULT_HUB,
    run_single_day,
)

TARGET_DATE: date | None = None
RUN_DATE: date | None = None
HUB: str = DEFAULT_HUB
HISTORY_DAYS: int = 730
CUTOFF_UTC: str | None = None
INCLUDE_ACTUALS: bool = True
ENTRYPOINT_NAME = "pjm_da_like_day_knn_sunny_meteo_rto_hourly_tomorrow"


def run(
    *,
    target_date: date | str | None = TARGET_DATE,
    run_date: date | str | None = RUN_DATE,
    hub: str = HUB,
    history_days: int = HISTORY_DAYS,
    pool_start_date: date | str | None = None,
    pool_year_months: dict[int, list[int]] | None = None,
    cutoff_utc: str | None = CUTOFF_UTC,
    feature_group_weights_override: dict[str, float] | None = None,
    include_actuals: bool = INCLUDE_ACTUALS,
    quiet: bool = False,
) -> dict[str, object]:
    return run_single_day(
        target_date=target_date,
        run_date=run_date,
        hub=hub,
        history_days=history_days,
        pool_start_date=pool_start_date,
        pool_year_months=pool_year_months,
        cutoff_utc=cutoff_utc,
        feature_group_weights_override=feature_group_weights_override,
        include_actuals=include_actuals,
        quiet=quiet,
    )


if __name__ == "__main__":
    from backend.modelling.pjm_da_models._entrypoint import run_entrypoint

    run_entrypoint(
        name=ENTRYPOINT_NAME,
        module_file=__file__,
        runner=run,
    )
