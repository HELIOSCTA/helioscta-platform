"""Single-day PJM-backed KNN Sunny historical pipeline."""

from __future__ import annotations

import sys
import uuid
from datetime import date, timedelta
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
    from backend.modelling.pjm_da_models.like_day_model_knn_sunny import configs, loader  # type: ignore[import-not-found]
    from backend.modelling.pjm_da_models.like_day_model_knn_sunny.pjm_rto_hourly import (  # type: ignore[import-not-found]
        forecast,
    )
    from backend.modelling.pjm_da_models.like_day_model_knn_sunny.pjm_rto_hourly.builder import (  # type: ignore[import-not-found]
        build_pool,
        build_query_row,
    )
else:
    from ... import configs, loader
    from .. import forecast
    from ..builder import build_pool, build_query_row


TARGET_DATE: date | None = None
RUN_DATE: date | None = None
HISTORY_DAYS: int = 730


def _resolve_date(value: date | str | None, *, default: date) -> date:
    if value is None:
        return default
    if isinstance(value, date):
        return value
    return date.fromisoformat(value)


def _configure_stdio() -> None:
    for stream in (sys.stdout, sys.stderr):
        reconfigure = getattr(stream, "reconfigure", None)
        if callable(reconfigure):
            reconfigure(encoding="utf-8", errors="replace")


def _features_complete(query: pd.DataFrame) -> bool:
    required = (
        "load_mw_at_hour",
        "solar_at_hour",
        "wind_at_hour",
        "net_load_at_hour",
        "temp_at_hour",
    )
    if len(query) < 24:
        return False
    return all(
        column in query.columns and not query[column].isna().any()
        for column in required
    )


def _latest_complete_pool_date(pool: pd.DataFrame, *, before: date) -> date:
    dates = sorted(
        {
            value
            for value in pd.to_datetime(pool["date"], errors="coerce").dt.date
            if value < before
        },
        reverse=True,
    )
    for candidate in dates:
        query = pool[pd.to_datetime(pool["date"], errors="coerce").dt.date == candidate]
        if _features_complete(query):
            return candidate
    raise ValueError(
        f"No complete PJM-backed feature date found before run_date={before}."
    )


def _filter_pool_by_start_date(
    pool: pd.DataFrame,
    pool_start_date: date | str | None,
) -> pd.DataFrame:
    if pool_start_date is None or pool.empty:
        return pool
    start_date = _resolve_date(pool_start_date, default=date.min)
    dates = pd.to_datetime(pool["date"], errors="coerce").dt.date
    return pool.loc[dates >= start_date].reset_index(drop=True)


def _filter_pool_by_year_months(
    pool: pd.DataFrame,
    pool_year_months: dict[int, list[int]] | None,
) -> pd.DataFrame:
    if not pool_year_months or pool.empty:
        return pool
    dates = pd.to_datetime(pool["date"], errors="coerce")
    keep = pd.Series(False, index=pool.index)
    for year, months in pool_year_months.items():
        keep = keep | ((dates.dt.year == int(year)) & dates.dt.month.isin(months))
    return pool.loc[keep].reset_index(drop=True)


def _apply_pool_filters(
    pool: pd.DataFrame,
    *,
    pool_start_date: date | str | None,
    pool_year_months: dict[int, list[int]] | None,
) -> pd.DataFrame:
    pool = _filter_pool_by_start_date(pool, pool_start_date)
    pool = _filter_pool_by_year_months(pool, pool_year_months)
    if pool.empty:
        raise ValueError("Pool is empty after applying pool filters.")
    return pool


def run(
    *,
    target_date: date | str | None = TARGET_DATE,
    run_date: date | str | None = RUN_DATE,
    hub: str = configs.HUB,
    history_days: int = HISTORY_DAYS,
    pool_start_date: date | str | None = None,
    pool_year_months: dict[int, list[int]] | None = None,
    feature_group_weights_override: dict[str, float] | None = None,
    quiet: bool = False,
) -> dict[str, object]:
    _configure_stdio()
    resolved_run_date = _resolve_date(run_date, default=loader.today_ept())
    pool = build_pool(
        run_date=resolved_run_date,
        history_days=history_days,
        hub=hub,
        load_region=configs.LOAD_REGION,
        weather_region=configs.WEATHER_REGION,
    )
    pool = _apply_pool_filters(
        pool,
        pool_start_date=pool_start_date,
        pool_year_months=pool_year_months,
    )
    resolved_target = _resolve_date(
        target_date,
        default=resolved_run_date + timedelta(days=1),
    )

    cfg = configs.KnnModelConfig(
        forecast_date=resolved_target.isoformat(),
        model_name=configs.PJM_RTO_HOURLY_SUNNY_SPEC.name,
        hub=hub,
        history_days=history_days,
    )
    query = build_query_row(
        resolved_target,
        pool=pool,
        run_date=resolved_run_date,
        load_region=cfg.load_region,
        weather_region=cfg.weather_region,
        meteo_region=cfg.meteo_region,
        meteo_forecast_area=cfg.meteo_forecast_area,
    )
    result = forecast.run_forecast(
        target_date=resolved_target,
        query=query,
        pool=pool,
        config=cfg,
        feature_group_weights_override=feature_group_weights_override,
    )
    result.update(
        {
            "run_id": str(uuid.uuid4()),
            "run_date": resolved_run_date.isoformat(),
            "target_date": resolved_target.isoformat(),
            "hub": hub,
            "n_pool": len(pool),
            "features_complete": _features_complete(query),
        }
    )
    if not quiet:
        print(
            f"KNN SUNNY PJM RTO | {hub} | target={resolved_target} | "
            f"pool_rows={len(pool):,} | analog_rows={len(result['analogs']):,}"
        )
        print(result["quantiles_table"].to_string(index=False))
    return result


if __name__ == "__main__":
    from backend.modelling.pjm_da_models._entrypoint import run_entrypoint

    run_entrypoint(
        name="pjm_da_knn_sunny_pjm_single_day",
        module_file=__file__,
        runner=run,
    )
