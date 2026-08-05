"""Shared native runner machinery for KNN Sunny pipeline entrypoints."""

from __future__ import annotations

import sys
import uuid
from collections.abc import Callable
from datetime import date, timedelta

import pandas as pd

from ..logging_utils import init_logging
from ..runtime import DEFAULT_LOG_DIR
from . import configs, loader, reporting as knn_reporting
from .pjm_rto_hourly import forecast


PoolBuilder = Callable[..., pd.DataFrame]
SingleDayQueryBuilder = Callable[
    [date, pd.DataFrame, date, str, configs.KnnModelConfig],
    pd.DataFrame,
]


def resolve_date(value: date | str | None, *, default: date) -> date:
    if value is None:
        return default
    if isinstance(value, date):
        return value
    return date.fromisoformat(value)


def configure_stdio() -> None:
    for stream in (sys.stdout, sys.stderr):
        reconfigure = getattr(stream, "reconfigure", None)
        if callable(reconfigure):
            reconfigure(encoding="utf-8", errors="replace")


def features_complete(query: pd.DataFrame) -> bool:
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


def filter_pool_by_start_date(
    pool: pd.DataFrame,
    pool_start_date: date | str | None,
) -> pd.DataFrame:
    if pool_start_date is None or pool.empty:
        return pool
    start_date = resolve_date(pool_start_date, default=date.min)
    dates = pd.to_datetime(pool["date"], errors="coerce").dt.date
    return pool.loc[dates >= start_date].reset_index(drop=True)


def filter_pool_by_year_months(
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


def apply_pool_filters(
    pool: pd.DataFrame,
    *,
    pool_start_date: date | str | None,
    pool_year_months: dict[int, list[int]] | None,
) -> pd.DataFrame:
    pool = filter_pool_by_start_date(pool, pool_start_date)
    pool = filter_pool_by_year_months(pool, pool_year_months)
    if pool.empty:
        raise ValueError("Pool is empty after applying pool filters.")
    return pool


def init_pipeline_logger(*, logger_name: str, quiet: bool):
    return init_logging(
        name=logger_name,
        log_dir=DEFAULT_LOG_DIR,
        log_to_file=False,
        log_to_console=not quiet,
    )


def run_single_day_forecast(
    *,
    source_label: str,
    logger_name: str,
    model_name: str,
    pool_builder: PoolBuilder,
    query_builder: SingleDayQueryBuilder,
    target_date: date | str | None = None,
    run_date: date | str | None = None,
    hub: str = configs.HUB,
    history_days: int = configs.DEFAULT_HISTORY_DAYS,
    pool_start_date: date | str | None = None,
    pool_year_months: dict[int, list[int]] | None = None,
    cutoff_utc: str | None = None,
    feature_group_weights_override: dict[str, float] | None = None,
    use_day_type_profiles: bool = True,
    include_actuals: bool = True,
    quiet: bool = False,
) -> dict[str, object]:
    configure_stdio()
    resolved_run_date = resolve_date(run_date, default=loader.today_ept())
    resolved_cutoff_utc = cutoff_utc or loader.default_cutoff_utc(resolved_run_date)
    resolved_target = resolve_date(
        target_date,
        default=resolved_run_date + timedelta(days=1),
    )

    cfg = configs.KnnModelConfig(
        forecast_date=resolved_target.isoformat(),
        model_name=model_name,
        hub=hub,
        history_days=history_days,
        use_day_type_profiles=use_day_type_profiles,
    )
    logger = init_pipeline_logger(logger_name=logger_name, quiet=quiet)
    try:
        with logger.timer("load historical feature pool"):
            pool = pool_builder(
                run_date=resolved_run_date,
                history_days=history_days,
                hub=hub,
                load_region=cfg.load_region,
                weather_region=cfg.weather_region,
            )
            pool = apply_pool_filters(
                pool,
                pool_start_date=pool_start_date,
                pool_year_months=pool_year_months,
            )
        with logger.timer(f"load {source_label} query features"):
            query = query_builder(
                resolved_target,
                pool,
                resolved_run_date,
                resolved_cutoff_utc,
                cfg,
            )
        actuals = pd.DataFrame()
        actual_hourly = None
        if include_actuals:
            with logger.timer(f"load settled DA LMP at {hub}"):
                actuals = loader.load_actual_da_lmps(
                    target_date=resolved_target,
                    hub=hub,
                )
            actual_hourly = loader.actuals_hourly(actuals)
        with logger.timer("run KNN Sunny forecast"):
            result = forecast.run_forecast(
                target_date=resolved_target,
                query=query,
                pool=pool,
                config=cfg,
                feature_group_weights_override=feature_group_weights_override,
                actual_hourly=actual_hourly,
                include_pool_actuals=include_actuals,
            )
        result.update(
            {
                "run_id": str(uuid.uuid4()),
                "run_date": resolved_run_date.isoformat(),
                "target_date": resolved_target.isoformat(),
                "hub": hub,
                "cutoff_utc": resolved_cutoff_utc,
                "n_pool": len(pool),
                "features_complete": features_complete(query),
                "actuals": actuals,
                "include_actuals": include_actuals,
            }
        )
        if not quiet:
            knn_reporting.print_single_day_report(
                logger,
                title=f"KNN SUNNY {source_label.upper()} | {hub} ($/MWh) | {resolved_target}",
                target_date=resolved_target,
                run_date=resolved_run_date,
                hub=hub,
                cutoff_utc=resolved_cutoff_utc,
                history_days=history_days,
                pool=pool,
                query=query,
                result=result,
            )
        return result
    finally:
        logger.close()
