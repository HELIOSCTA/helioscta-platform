"""Shared native runner machinery for KNN Sunny pipeline entrypoints."""

from __future__ import annotations

import sys
import uuid
from collections.abc import Callable
from datetime import date, timedelta

import pandas as pd

from ..logging_utils import init_logging
from ..result_envelope import build_result_envelope, canonical_log_name, max_timestamp
from ..runtime import DEFAULT_LOG_DIR
from . import configs, loader
from .pjm_rto_hourly import forecast, printers as legacy_printers

MODEL_FAMILY = "like_day_knn_sunny"

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
    model_name: str,
    pool_builder: PoolBuilder,
    query_builder: SingleDayQueryBuilder,
    input_family: str = "pjm_rto_hourly",
    horizon: str = "tomorrow",
    logger_name: str | None = None,
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
    resolved_logger_name = logger_name or canonical_log_name(
        MODEL_FAMILY,
        input_family,
        horizon,
    )
    logger = init_pipeline_logger(logger_name=resolved_logger_name, quiet=quiet)
    try:
        with logger.timer("resolve params"):
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

        with logger.timer("resolve target dates"):
            target_dates = [resolved_target]

        with logger.timer("load source inputs"):
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
            query = query_builder(
                target_dates[0],
                pool,
                resolved_run_date,
                resolved_cutoff_utc,
                cfg,
            )
        actuals = pd.DataFrame()
        actual_hourly = None
        if include_actuals:
            with logger.timer("load actuals"):
                actuals = loader.load_actual_da_lmps(
                    target_date=target_dates[0],
                    hub=hub,
                )
            actual_hourly = loader.actuals_hourly(actuals)

        with logger.timer("run model"):
            result = forecast.run_forecast(
                target_date=target_dates[0],
                query=query,
                pool=pool,
                config=cfg,
                feature_group_weights_override=feature_group_weights_override,
                actual_hourly=actual_hourly,
                include_pool_actuals=include_actuals,
            )

        with logger.timer("build outputs"):
            run_id = str(uuid.uuid4())
            df_forecast = result.get("df_forecast", pd.DataFrame())
            output_table = result.get("output_table", pd.DataFrame())
            quantiles_table = result.get("quantiles_table", pd.DataFrame())
            analogs = result.get("analogs", pd.DataFrame())
            target_features = result.get("target_features", query)
            if not isinstance(df_forecast, pd.DataFrame):
                df_forecast = pd.DataFrame()
            if not isinstance(output_table, pd.DataFrame):
                output_table = pd.DataFrame()
            if not isinstance(quantiles_table, pd.DataFrame):
                quantiles_table = pd.DataFrame()
            if not isinstance(analogs, pd.DataFrame):
                analogs = pd.DataFrame()
            if not isinstance(target_features, pd.DataFrame):
                target_features = query
            complete_features = features_complete(query)
            has_actuals = bool(result.get("has_actuals", actual_hourly is not None))
            warnings: list[str] = []
            if not complete_features:
                warnings.append(f"Target feature set is incomplete for {target_dates[0]}.")

            result.update(
                {
                    "run_id": run_id,
                    "run_date": resolved_run_date.isoformat(),
                    "target_date": target_dates[0].isoformat(),
                    "hub": hub,
                    "cutoff_utc": resolved_cutoff_utc,
                    "n_pool": len(pool),
                    "features_complete": complete_features,
                    "actuals": actuals,
                    "include_actuals": include_actuals,
                    "has_actuals": has_actuals,
                }
            )
            tables = {
                "forecast": df_forecast,
                "output": output_table,
                "quantiles": quantiles_table,
                "analogs": analogs,
                "target_features": target_features,
                "actuals": actuals,
            }
            status = {
                "row_counts": {
                    "forecast_rows": len(df_forecast),
                    "output_rows": len(output_table),
                    "quantile_rows": len(quantiles_table),
                    "analog_rows": len(analogs),
                    "query_rows": len(query),
                    "pool_rows": len(pool),
                    "actual_rows": len(actuals),
                },
                "has_actuals": has_actuals,
                "features_complete": complete_features,
                "warnings": warnings,
            }
            diagnostics = {
                "source_freshness": {
                    "actuals_updated_at": max_timestamp(actuals, "updated_at"),
                },
                "settings": {
                    "history_days": history_days,
                    "pool_start_date": str(pool_start_date)
                    if pool_start_date is not None
                    else None,
                    "pool_year_months": pool_year_months,
                    "feature_group_weights_override": feature_group_weights_override,
                    "use_day_type_profiles": use_day_type_profiles,
                    "config": cfg,
                    "day_type": result.get("day_type"),
                    "feature_weights": result.get("feature_weights"),
                    "metrics": result.get("metrics", {}),
                },
            }
            envelope = build_result_envelope(
                model_family=MODEL_FAMILY,
                model_name=model_name,
                input_family=input_family,
                horizon=horizon,
                run_id=run_id,
                run_date=resolved_run_date,
                target_date=target_dates[0],
                target_dates=target_dates,
                hub=hub,
                cutoff_utc=resolved_cutoff_utc,
                include_actuals=include_actuals,
                tables=tables,
                status=status,
                diagnostics=diagnostics,
                aliases=result,
            )

        if not quiet:
            with logger.timer("print report"):
                legacy_printers.print_single_day_report(
                    logger,
                    title=(
                        f"KNN SUNNY {source_label.upper()} | "
                        f"{hub} ($/MWh) | {target_dates[0]}"
                    ),
                    target_date=target_dates[0],
                    run_date=resolved_run_date,
                    hub=hub,
                    cutoff_utc=resolved_cutoff_utc,
                    history_days=history_days,
                    pool=pool,
                    query=query,
                    result=result,
                )
        return envelope
    finally:
        logger.close()
