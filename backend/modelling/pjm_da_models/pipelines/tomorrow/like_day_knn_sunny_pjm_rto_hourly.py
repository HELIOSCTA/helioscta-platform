"""Tomorrow's PJM-backed KNN Sunny pipeline."""

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

import numpy as np
import pandas as pd

from backend.modelling.pjm_da_models.like_day_model_knn_sunny import configs
from backend.modelling.pjm_da_models.like_day_model_knn_sunny.pjm_rto_hourly.pipelines import (
    _shared as pjm_shared,
)

DEFAULT_HUB = pjm_shared.DEFAULT_HUB
INPUT_FAMILY = pjm_shared.INPUT_FAMILY
ENTRYPOINT_NAME = "pjm_da_like_day_knn_sunny_pjm_rto_hourly_tomorrow"
LOGGER_NAME = ENTRYPOINT_NAME
TARGET_DATE: date | None = None
RUN_DATE: date | None = None
HISTORY_DAYS: int = 730
CUTOFF_UTC: str | None = None
INCLUDE_ACTUALS: bool = True
PUBLISH: bool = False
MODEL_NAME: str = pjm_shared.MODEL_NAME
N_ANALOGS: int | None = None
SEASON_WINDOW_DAYS: int | None = None
MIN_POOL_SIZE: int | None = None
LABEL_SOURCE: str = configs.LABEL_SOURCE
RECENCY_HALF_LIFE_DAYS: float | None = None
DEFAULT_RECENCY_HALF_LIFE_DAYS: float = pjm_shared.DEFAULT_RECENCY_HALF_LIFE_DAYS


def run(
    *,
    target_date: date | str | None = TARGET_DATE,
    run_date: date | str | None = RUN_DATE,
    model_name: str = MODEL_NAME,
    n_analogs: int | None = N_ANALOGS,
    season_window_days: int | None = SEASON_WINDOW_DAYS,
    min_pool_size: int | None = MIN_POOL_SIZE,
    label_source: str = LABEL_SOURCE,
    recency_half_life_days: float | None = RECENCY_HALF_LIFE_DAYS,
    quantiles: tuple[float, ...] | list[float] | None = None,
    display_quantiles: tuple[float, ...] | list[float] | None = None,
    pool: pd.DataFrame | None = None,
    hub: str = DEFAULT_HUB,
    history_days: int = HISTORY_DAYS,
    pool_start_date: date | str | None = None,
    pool_year_months: dict[int, list[int]] | None = None,
    cutoff_utc: str | None = CUTOFF_UTC,
    include_actuals: bool = INCLUDE_ACTUALS,
    publish: bool = PUBLISH,
    quiet: bool = False,
    y_naive_override: np.ndarray | None = None,
    feature_group_weights_override: dict[str, float] | None = None,
) -> dict[str, object]:
    return pjm_shared.run_single_day(
        target_date=target_date,
        run_date=run_date,
        model_name=model_name,
        n_analogs=n_analogs,
        season_window_days=season_window_days,
        min_pool_size=min_pool_size,
        label_source=label_source,
        recency_half_life_days=recency_half_life_days,
        quantiles=quantiles,
        display_quantiles=display_quantiles,
        pool=pool,
        hub=hub,
        history_days=history_days,
        pool_start_date=pool_start_date,
        pool_year_months=pool_year_months,
        cutoff_utc=cutoff_utc,
        include_actuals=include_actuals,
        publish=publish,
        quiet=quiet,
        y_naive_override=y_naive_override,
        feature_group_weights_override=feature_group_weights_override,
    )


if __name__ == "__main__":
    from backend.modelling.pjm_da_models._entrypoint import run_entrypoint

    run_entrypoint(
        name=ENTRYPOINT_NAME,
        module_file=__file__,
        runner=run,
    )
