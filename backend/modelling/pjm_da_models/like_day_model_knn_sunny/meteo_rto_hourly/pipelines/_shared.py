"""Shared implementation for Meteologica-fed KNN Sunny forecast pipelines."""

from __future__ import annotations

import uuid
from datetime import date

import pandas as pd

from ....result_envelope import (
    build_result_envelope,
    canonical_log_name,
    horizon_name_for_days,
    max_timestamp,
)
from ... import configs, loader, reporting as knn_reporting
from ...pipeline_shared import (
    MODEL_FAMILY,
    apply_pool_filters,
    configure_stdio,
    features_complete,
    init_pipeline_logger,
    resolve_date,
    run_single_day_forecast,
)
from ...pjm_rto_hourly import forecast
from ..builder import (
    build_horizon_query_rows,
    build_pool,
)


INPUT_FAMILY = "meteo_rto_hourly"
MODEL_NAME = configs.METEO_RTO_HOURLY_SUNNY_SPEC.name
DEFAULT_HUB = configs.HUB


def _logger_name(horizon: str) -> str:
    return canonical_log_name(MODEL_FAMILY, INPUT_FAMILY, horizon)


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
        input_family=INPUT_FAMILY,
        horizon="tomorrow",
        logger_name=_logger_name("tomorrow"),
        model_name=MODEL_NAME,
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
    horizon = horizon_name_for_days(horizon_days)
    logger = init_pipeline_logger(logger_name=_logger_name(horizon), quiet=quiet)
    try:
        with logger.timer("resolve params"):
            resolved_run_date = resolve_date(run_date, default=loader.today_ept())
            resolved_cutoff_utc = cutoff_utc or loader.default_cutoff_utc(resolved_run_date)
            cfg = configs.KnnModelConfig(
                model_name=MODEL_NAME,
                hub=hub,
                history_days=history_days,
            )

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
        with logger.timer("load source inputs"):
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
            with logger.timer("load actuals"):
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
                has_actuals = bool(result.get("has_actuals", actual_hourly is not None))
                result.update(
                    {
                        "run_date": resolved_run_date.isoformat(),
                        "target_date": target.isoformat(),
                        "hub": hub,
                        "cutoff_utc": resolved_cutoff_utc,
                        "n_pool": len(pool),
                        "features_complete": is_complete,
                        "has_actuals": has_actuals,
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

        with logger.timer("build outputs"):
            strip_table = pd.DataFrame(rows)
            df_forecast = (
                pd.concat(forecasts_by_date.values(), ignore_index=True)
                if forecasts_by_date
                else pd.DataFrame()
            )

        if not quiet:
            with logger.timer("print report"):
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

        features_by_date = {
            target.isoformat(): bool(results_by_date[target.isoformat()]["features_complete"])
            for target in target_dates
        }
        has_actuals_by_date = {
            target.isoformat(): bool(results_by_date[target.isoformat()]["has_actuals"])
            for target in target_dates
        }
        warnings: list[str] = []
        if not target_dates:
            warnings.append("No available target dates found for the requested horizon.")
        incomplete = [key for key, complete in features_by_date.items() if not complete]
        if incomplete:
            warnings.append(
                "Target feature set is incomplete for: " + ", ".join(incomplete)
            )
        run_id = str(uuid.uuid4())
        tables = {
            "strip": strip_table,
            "forecast": df_forecast,
            "actuals": actuals,
            "forecasts_by_date": forecasts_by_date,
            "quantiles_by_date": bands_by_date,
            "analogs_by_date": analogs_by_date,
            "target_features_by_date": queries_by_date,
            "output_by_date": output_tables_by_date,
        }
        status = {
            "row_counts": {
                "target_dates": len(target_dates),
                "strip_rows": len(strip_table),
                "forecast_rows": len(df_forecast),
                "pool_rows": len(pool),
                "actual_rows": len(actuals),
                "analog_rows": sum(len(frame) for frame in analogs_by_date.values()),
            },
            "has_actuals": any(has_actuals_by_date.values()),
            "features_complete": all(features_by_date.values())
            if features_by_date
            else False,
            "warnings": warnings,
        }
        diagnostics = {
            "source_freshness": {
                "actuals_updated_at": max_timestamp(actuals, "updated_at"),
            },
            "settings": {
                "horizon_days": horizon_days,
                "history_days": history_days,
                "pool_start_date": str(pool_start_date)
                if pool_start_date is not None
                else None,
                "pool_year_months": pool_year_months,
                "feature_group_weights_override": feature_group_weights_override,
                "per_day_detail": per_day_detail,
                "use_day_type_profiles": use_day_type_profiles,
                "config": cfg,
                "metrics_by_date": metrics_by_date,
            },
            "features_complete_by_date": features_by_date,
            "has_actuals_by_date": has_actuals_by_date,
        }
        aliases = {
            "horizon_days": horizon_days,
            "strip_table": strip_table,
            "df_forecast": df_forecast,
            "output_table": strip_table,
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
        }
        return build_result_envelope(
            model_family=MODEL_FAMILY,
            model_name=MODEL_NAME,
            input_family=INPUT_FAMILY,
            horizon=horizon,
            run_id=run_id,
            run_date=resolved_run_date,
            target_date=None,
            target_dates=target_dates,
            hub=hub,
            cutoff_utc=resolved_cutoff_utc,
            include_actuals=include_actuals,
            tables=tables,
            status=status,
            diagnostics=diagnostics,
            aliases=aliases,
        )
    finally:
        logger.close()
