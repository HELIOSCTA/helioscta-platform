"""Shared implementation for Meteologica-fed KNN Sunny forecast pipelines."""

from __future__ import annotations

import uuid
from datetime import date

import pandas as pd

from ... import configs, loader, reporting as knn_reporting
from ...pipeline_shared import (
    apply_pool_filters,
    configure_stdio,
    features_complete,
    init_pipeline_logger,
    resolve_date,
    run_single_day_forecast,
)
from ...pjm_rto_hourly import forecast
from ..builder import build_horizon_query_rows, build_pool


LOGGER_NAME = "pjm_da_like_day_knn_sunny_meteo_rto_hourly"


def _build_single_day_query(
    target_date: date,
    pool: pd.DataFrame,
    run_date: date,
    cutoff_utc: str,
    cfg: configs.KnnModelConfig,
) -> pd.DataFrame:
    _ = pool
    return build_horizon_query_rows(
        [target_date],
        run_date=run_date,
        cutoff_utc=cutoff_utc,
        load_region=cfg.load_region,
        weather_region=cfg.weather_region,
        meteo_region=cfg.meteo_region,
        meteo_forecast_area=cfg.meteo_forecast_area,
    ).get(target_date, pd.DataFrame())


def _print_horizon_report(
    logger,
    *,
    run_date: date,
    hub: str,
    cutoff_utc: str,
    horizon_days: int | None,
    pool_rows: int,
    target_dates: list[date],
    strip_table: pd.DataFrame,
) -> None:
    window_label = (
        "FULL PREDICTION WINDOW"
        if horizon_days is None
        else f"NEXT {horizon_days} DAYS"
    )
    knn_reporting.print_horizon_report(
        logger,
        title=f"KNN SUNNY METEO RTO {window_label} | {hub} ($/MWh)",
        run_date=run_date,
        hub=hub,
        cutoff_utc=cutoff_utc,
        pool_rows=pool_rows,
        target_dates=target_dates,
        strip_table=strip_table,
    )


def run_single_day(
    *,
    target_date: date | str | None = None,
    run_date: date | str | None = None,
    hub: str = configs.HUB,
    history_days: int = configs.DEFAULT_HISTORY_DAYS,
    pool_start_date: date | str | None = None,
    pool_year_months: dict[int, list[int]] | None = None,
    cutoff_utc: str | None = None,
    feature_group_weights_override: dict[str, float] | None = None,
    include_actuals: bool = True,
    quiet: bool = False,
) -> dict[str, object]:
    return run_single_day_forecast(
        source_label="METEO RTO",
        logger_name=LOGGER_NAME,
        model_name=configs.METEO_RTO_HOURLY_SUNNY_SPEC.name,
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


def run_latest_horizon(
    *,
    run_date: date | str | None = None,
    horizon_days: int | None = 14,
    hub: str = configs.HUB,
    history_days: int = configs.DEFAULT_HISTORY_DAYS,
    pool_start_date: date | str | None = None,
    pool_year_months: dict[int, list[int]] | None = None,
    cutoff_utc: str | None = None,
    feature_group_weights_override: dict[str, float] | None = None,
    include_actuals: bool = True,
    per_day_detail: bool = True,
    use_day_type_profiles: bool = False,
    quiet: bool = False,
) -> dict[str, object]:
    configure_stdio()
    resolved_run_date = resolve_date(run_date, default=loader.today_ept())
    resolved_cutoff_utc = cutoff_utc or loader.default_cutoff_utc(resolved_run_date)
    cfg = configs.KnnModelConfig(
        model_name=configs.METEO_RTO_HOURLY_SUNNY_SPEC.name,
        hub=hub,
        history_days=history_days,
    )
    logger = init_pipeline_logger(logger_name=LOGGER_NAME, quiet=quiet)
    try:
        with logger.timer("resolve available target dates"):
            target_dates = loader.available_target_dates(
                run_date=resolved_run_date,
                horizon_days=horizon_days,
                cutoff_utc=resolved_cutoff_utc,
            )
        with logger.timer("load historical feature pool"):
            pool = build_pool(
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
        with logger.timer("load METEO RTO query features"):
            query_frames = build_horizon_query_rows(
                target_dates,
                run_date=resolved_run_date,
                cutoff_utc=resolved_cutoff_utc,
                load_region=cfg.load_region,
                weather_region=cfg.weather_region,
                meteo_region=cfg.meteo_region,
                meteo_forecast_area=cfg.meteo_forecast_area,
            )
        actuals = pd.DataFrame()
        actual_hourly_by_date: dict[date, dict[int, float]] = {}
        if include_actuals and target_dates:
            with logger.timer(f"load settled DA LMP at {hub} for target horizon"):
                actuals = loader.load_lmp_history(
                    start_date=min(target_dates),
                    end_date=max(target_dates),
                    hub=hub,
                )
            actual_hourly_by_date = loader.actuals_by_date_hour(actuals)

        rows: list[dict[str, object]] = []
        forecasts_by_date: dict[str, pd.DataFrame] = {}
        bands_by_date: dict[str, pd.DataFrame] = {}
        analogs_by_date: dict[str, pd.DataFrame] = {}
        queries_by_date: dict[str, pd.DataFrame] = {}
        output_tables_by_date: dict[str, pd.DataFrame] = {}
        metrics_by_date: dict[str, dict[str, float]] = {}
        actual_hourly_maps_by_date: dict[str, dict[int, float]] = {}
        results_by_date: dict[str, dict[str, object]] = {}

        with logger.timer("run KNN Sunny horizon forecasts"):
            for target in target_dates:
                day_cfg = configs.KnnModelConfig(
                    forecast_date=target.isoformat(),
                    model_name=configs.METEO_RTO_HOURLY_SUNNY_SPEC.name,
                    hub=hub,
                    history_days=history_days,
                    use_day_type_profiles=use_day_type_profiles,
                )
                query = query_frames.get(target, pd.DataFrame())
                actual_hourly = actual_hourly_by_date.get(target)
                result = forecast.run_forecast(
                    target_date=target,
                    query=query,
                    pool=pool,
                    config=day_cfg,
                    feature_group_weights_override=feature_group_weights_override,
                    actual_hourly=actual_hourly,
                    include_pool_actuals=include_actuals,
                )
                is_complete = features_complete(query)
                result.update(
                    {
                        "run_date": resolved_run_date.isoformat(),
                        "target_date": target.isoformat(),
                        "hub": hub,
                        "cutoff_utc": resolved_cutoff_utc,
                        "n_pool": len(pool),
                        "features_complete": is_complete,
                        "include_actuals": include_actuals,
                    }
                )
                df_forecast = result["df_forecast"]
                assert isinstance(df_forecast, pd.DataFrame)
                rows.append(
                    forecast.build_strip_row(
                        target,
                        df_forecast,
                        resolved_run_date,
                        actual_hourly=actual_hourly,
                    )
                )
                rows[-1]["features_complete"] = is_complete
                rows[-1]["n_analogs"] = result.get("n_analogs_used", 0)
                forecasts_by_date[target.isoformat()] = df_forecast
                bands = result["quantiles_table"]
                assert isinstance(bands, pd.DataFrame)
                bands_by_date[target.isoformat()] = bands
                analogs = result["analogs"]
                assert isinstance(analogs, pd.DataFrame)
                analogs_by_date[target.isoformat()] = analogs
                queries_by_date[target.isoformat()] = query
                output_table = result["output_table"]
                assert isinstance(output_table, pd.DataFrame)
                output_tables_by_date[target.isoformat()] = output_table
                metrics = result.get("metrics")
                metrics_by_date[target.isoformat()] = metrics if isinstance(metrics, dict) else {}
                if actual_hourly:
                    actual_hourly_maps_by_date[target.isoformat()] = actual_hourly
                results_by_date[target.isoformat()] = result

        strip_table = pd.DataFrame(rows)
        if not quiet:
            _print_horizon_report(
                logger,
                run_date=resolved_run_date,
                hub=hub,
                cutoff_utc=resolved_cutoff_utc,
                horizon_days=horizon_days,
                pool_rows=len(pool),
                target_dates=target_dates,
                strip_table=strip_table,
            )
            if per_day_detail:
                for target in target_dates:
                    key = target.isoformat()
                    result = results_by_date[key]
                    knn_reporting.print_single_day_report(
                        logger,
                        title=f"KNN SUNNY METEO RTO | {hub} ($/MWh) | {target}",
                        target_date=target,
                        run_date=resolved_run_date,
                        hub=hub,
                        cutoff_utc=resolved_cutoff_utc,
                        history_days=history_days,
                        pool=pool,
                        query=queries_by_date[key],
                        result=result,
                    )

        return {
            "run_id": str(uuid.uuid4()),
            "run_date": resolved_run_date.isoformat(),
            "cutoff_utc": resolved_cutoff_utc,
            "horizon_days": horizon_days,
            "hub": hub,
            "target_dates": [target.isoformat() for target in target_dates],
            "strip_table": strip_table,
            "forecasts_by_date": forecasts_by_date,
            "bands_by_date": bands_by_date,
            "analogs_by_date": analogs_by_date,
            "queries_by_date": queries_by_date,
            "output_tables_by_date": output_tables_by_date,
            "metrics_by_date": metrics_by_date,
            "actuals": actuals,
            "actual_hourly_by_date": actual_hourly_maps_by_date,
            "results_by_date": results_by_date,
            "n_pool": len(pool),
            "include_actuals": include_actuals,
        }
    finally:
        logger.close()
