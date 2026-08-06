"""Shared implementation for PJM-backed KNN Sunny forecast pipelines."""

from __future__ import annotations

import uuid
from datetime import date, timedelta

import numpy as np
import pandas as pd

from ....result_envelope import build_result_envelope, canonical_log_name, max_timestamp
from ... import configs, loader
from ...pipeline_shared import (
    MODEL_FAMILY,
    apply_pool_filters,
    configure_stdio,
    features_complete,
    init_pipeline_logger,
    resolve_date,
)
from .. import forecast, printers
from ..builder import build_pool, build_query_row

INPUT_FAMILY = "pjm_rto_hourly"
MODEL_NAME = configs.PJM_RTO_HOURLY_SUNNY_SPEC.name
DEFAULT_HUB = configs.HUB
DEFAULT_QUANTILES: tuple[float, ...] = tuple(configs.QUANTILES)
DISPLAY_QUANTILES: tuple[float, ...] = tuple(configs.DISPLAY_QUANTILES)
DEFAULT_RECENCY_HALF_LIFE_DAYS: float = 730.0


def _logger_name(horizon: str) -> str:
    return canonical_log_name(MODEL_FAMILY, INPUT_FAMILY, horizon)


def _resolve_optional_int(value: int | None, default: int) -> int:
    return default if value is None else int(value)


def _resolve_optional_float(value: float | None, default: float) -> float:
    return default if value is None else float(value)


def _build_config(
    *,
    target_date: date,
    model_name: str,
    n_analogs: int | None,
    season_window_days: int | None,
    min_pool_size: int | None,
    label_source: str,
    recency_half_life_days: float | None,
    quantiles: tuple[float, ...] | list[float] | None,
    display_quantiles: tuple[float, ...] | list[float] | None,
    hub: str,
    history_days: int,
) -> configs.KnnModelConfig:
    return configs.KnnModelConfig(
        forecast_date=target_date.isoformat(),
        model_name=model_name,
        n_analogs=_resolve_optional_int(n_analogs, configs.DEFAULT_N_ANALOGS),
        season_window_days=_resolve_optional_int(
            season_window_days,
            configs.SEASON_WINDOW_DAYS,
        ),
        min_pool_size=_resolve_optional_int(min_pool_size, configs.MIN_POOL_SIZE),
        recency_half_life_days=_resolve_optional_float(
            recency_half_life_days,
            DEFAULT_RECENCY_HALF_LIFE_DAYS,
        ),
        label_source=label_source,
        quantiles=list(quantiles if quantiles is not None else DEFAULT_QUANTILES),
        display_quantiles=list(
            display_quantiles
            if display_quantiles is not None
            else DISPLAY_QUANTILES
        ),
        hub=hub,
        history_days=history_days,
        use_day_type_profiles=True,
    )


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


def run_single_day(
    *,
    target_date: date | str | None = None,
    run_date: date | str | None = None,
    model_name: str = MODEL_NAME,
    n_analogs: int | None = None,
    season_window_days: int | None = None,
    min_pool_size: int | None = None,
    label_source: str = configs.LABEL_SOURCE,
    recency_half_life_days: float | None = None,
    quantiles: tuple[float, ...] | list[float] | None = None,
    display_quantiles: tuple[float, ...] | list[float] | None = None,
    pool: pd.DataFrame | None = None,
    hub: str = DEFAULT_HUB,
    history_days: int = configs.DEFAULT_HISTORY_DAYS,
    pool_start_date: date | str | None = None,
    pool_year_months: dict[int, list[int]] | None = None,
    cutoff_utc: str | None = None,
    include_actuals: bool = True,
    publish: bool = False,
    quiet: bool = False,
    y_naive_override: np.ndarray | None = None,
    feature_group_weights_override: dict[str, float] | None = None,
) -> dict[str, object]:
    configure_stdio()
    logger = init_pipeline_logger(logger_name=_logger_name("tomorrow"), quiet=quiet)
    try:
        with logger.timer("resolve params"):
            resolved_run_date = resolve_date(run_date, default=loader.today_ept())
            resolved_cutoff_utc = cutoff_utc or loader.default_cutoff_utc(
                resolved_run_date
            )
            resolved_target = resolve_date(
                target_date,
                default=resolved_run_date + timedelta(days=1),
            )
            cfg = _build_config(
                target_date=resolved_target,
                model_name=model_name,
                n_analogs=n_analogs,
                season_window_days=season_window_days,
                min_pool_size=min_pool_size,
                label_source=label_source,
                recency_half_life_days=recency_half_life_days,
                quantiles=quantiles,
                display_quantiles=display_quantiles,
                hub=hub,
                history_days=history_days,
            )
            resolved_cfg, _day_type = cfg.with_day_type_overrides(resolved_target)
            resolved_cfg.resolved_spec()

        with logger.timer("resolve target dates"):
            target_dates = [resolved_target]

        with logger.timer("load source inputs"):
            if pool is None:
                pool_frame = build_pool(
                    run_date=resolved_run_date,
                    history_days=history_days,
                    hub=hub,
                    label_source=resolved_cfg.label_source,
                    load_region=resolved_cfg.load_region,
                    weather_region=resolved_cfg.weather_region,
                )
            else:
                pool_frame = loader.apply_label_source(
                    pool,
                    resolved_cfg.label_source,
                )
            pool_frame = apply_pool_filters(
                pool_frame,
                pool_start_date=pool_start_date,
                pool_year_months=pool_year_months,
            )
            query = _build_single_day_query(
                resolved_target,
                pool_frame,
                resolved_run_date,
                resolved_cutoff_utc,
                resolved_cfg,
            )

        actuals = pd.DataFrame()
        actual_hourly = None
        if include_actuals:
            with logger.timer("load actuals"):
                actuals = loader.load_actual_da_lmps(
                    target_date=resolved_target,
                    hub=hub,
                )
            actual_hourly = loader.actuals_hourly(actuals)

        with logger.timer("run model"):
            result = forecast.run_forecast(
                target_date=resolved_target,
                query=query,
                pool=pool_frame,
                config=cfg,
                feature_group_weights_override=feature_group_weights_override,
                actual_hourly=actual_hourly,
                include_pool_actuals=include_actuals,
                y_naive_override=y_naive_override,
                display_quantiles=cfg.resolved_display_quantiles(),
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
                warnings.append(f"Target feature set is incomplete for {resolved_target}.")

            result.update(
                {
                    "run_id": run_id,
                    "run_date": resolved_run_date.isoformat(),
                    "target_date": resolved_target.isoformat(),
                    "hub": hub,
                    "cutoff_utc": resolved_cutoff_utc,
                    "n_pool": len(pool_frame),
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
                    "pool_rows": len(pool_frame),
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
                    "pool_provided": pool is not None,
                    "publish_requested": bool(publish),
                    "y_naive_override_provided": y_naive_override is not None,
                    "config": result.get("config", cfg),
                    "display_quantiles": cfg.resolved_display_quantiles(),
                    "day_type": result.get("day_type"),
                    "feature_weights": result.get("feature_weights"),
                    "metrics": result.get("metrics", {}),
                },
            }
            envelope = build_result_envelope(
                model_family=MODEL_FAMILY,
                model_name=model_name,
                input_family=INPUT_FAMILY,
                horizon="tomorrow",
                run_id=run_id,
                run_date=resolved_run_date,
                target_date=resolved_target,
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
                printers.print_single_day_report(
                    logger,
                    title=f"KNN SUNNY PJM RTO | {hub} ($/MWh) | {resolved_target}",
                    target_date=resolved_target,
                    run_date=resolved_run_date,
                    hub=hub,
                    cutoff_utc=resolved_cutoff_utc,
                    history_days=history_days,
                    pool=pool_frame,
                    query=query,
                    result=result,
                )
        return envelope
    finally:
        logger.close()
