"""Tomorrow's PJM-backed KNN Sunny pipeline."""

from __future__ import annotations

import sys
from datetime import date
from pathlib import Path

import pandas as pd


def _find_repo_root() -> Path:
    for parent in Path(__file__).resolve().parents:
        if (parent / "backend" / "modelling" / "pjm_da_models").exists():
            return parent
    raise RuntimeError("Could not locate helioscta-platform repo root with backend/modelling/pjm_da_models.")


if __package__ in (None, ""):
    _REPO_ROOT = _find_repo_root()
    if str(_REPO_ROOT) not in sys.path:
        sys.path.insert(0, str(_REPO_ROOT))
    from backend.modelling.pjm_da_models.like_day_model_knn_sunny import configs  # type: ignore[import-not-found]
    from backend.modelling.pjm_da_models.like_day_model_knn_sunny.pipeline_shared import (  # type: ignore[import-not-found]
        run_single_day_forecast,
    )
    from backend.modelling.pjm_da_models.like_day_model_knn_sunny.pjm_rto_hourly.builder import (  # type: ignore[import-not-found]
        build_pool,
        build_query_row,
    )
else:
    from ... import configs
    from ...pipeline_shared import run_single_day_forecast
    from ..builder import build_pool, build_query_row


LOGGER_NAME = "pjm_da_like_day_knn_sunny_pjm_rto_hourly"
TARGET_DATE: date | None = None
RUN_DATE: date | None = None
HISTORY_DAYS: int = 730
CUTOFF_UTC: str | None = None
INCLUDE_ACTUALS: bool = True


def _build_single_day_query(
    target_date: date,
    pool: pd.DataFrame,
    run_date: date,
    cutoff_utc: str,
    cfg: configs.KnnModelConfig,
) -> pd.DataFrame:
    return build_query_row(
        target_date,
        pool=pool,
        run_date=run_date,
        cutoff_utc=cutoff_utc,
        load_region=cfg.load_region,
        weather_region=cfg.weather_region,
        meteo_region=cfg.meteo_region,
        meteo_forecast_area=cfg.meteo_forecast_area,
    )


def run(
    *,
    target_date: date | str | None = TARGET_DATE,
    run_date: date | str | None = RUN_DATE,
    hub: str = configs.HUB,
    history_days: int = HISTORY_DAYS,
    pool_start_date: date | str | None = None,
    pool_year_months: dict[int, list[int]] | None = None,
    cutoff_utc: str | None = CUTOFF_UTC,
    feature_group_weights_override: dict[str, float] | None = None,
    include_actuals: bool = INCLUDE_ACTUALS,
    quiet: bool = False,
) -> dict[str, object]:
    return run_single_day_forecast(
        source_label="PJM RTO",
        logger_name=LOGGER_NAME,
        model_name=configs.PJM_RTO_HOURLY_SUNNY_SPEC.name,
        pool_builder=build_pool,
        query_builder=_build_single_day_query,
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
        name="pjm_da_like_day_knn_sunny_pjm_rto_hourly_tomorrow",
        module_file=__file__,
        runner=run,
    )
