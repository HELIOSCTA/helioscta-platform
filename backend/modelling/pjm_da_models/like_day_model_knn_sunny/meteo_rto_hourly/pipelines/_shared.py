"""Shared implementation for Meteologica-fed KNN Sunny forecast pipelines."""

from __future__ import annotations

import sys
import uuid
from datetime import date, timedelta

import pandas as pd

from ... import configs, loader
from ...pjm_rto_hourly import forecast
from ..builder import build_horizon_query_rows, build_pool


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
    quiet: bool = False,
) -> dict[str, object]:
    _configure_stdio()
    resolved_run_date = _resolve_date(run_date, default=loader.today_ept())
    resolved_cutoff_utc = cutoff_utc or loader.default_cutoff_utc(resolved_run_date)
    resolved_target = _resolve_date(
        target_date,
        default=resolved_run_date + timedelta(days=1),
    )
    cfg = configs.KnnModelConfig(
        forecast_date=resolved_target.isoformat(),
        model_name=configs.METEO_RTO_HOURLY_SUNNY_SPEC.name,
        hub=hub,
        history_days=history_days,
    )
    pool = build_pool(
        run_date=resolved_run_date,
        history_days=history_days,
        hub=hub,
        load_region=cfg.load_region,
        weather_region=cfg.weather_region,
    )
    pool = _apply_pool_filters(
        pool,
        pool_start_date=pool_start_date,
        pool_year_months=pool_year_months,
    )
    query = build_horizon_query_rows(
        [resolved_target],
        run_date=resolved_run_date,
        cutoff_utc=resolved_cutoff_utc,
        load_region=cfg.load_region,
        weather_region=cfg.weather_region,
        meteo_region=cfg.meteo_region,
        meteo_forecast_area=cfg.meteo_forecast_area,
    ).get(resolved_target, pd.DataFrame())
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
            "cutoff_utc": resolved_cutoff_utc,
            "n_pool": len(pool),
            "features_complete": _features_complete(query),
        }
    )
    if not quiet:
        print(
            f"KNN SUNNY METEO RTO | {hub} | target={resolved_target} | "
            f"pool_rows={len(pool):,} | analog_rows={len(result['analogs']):,}"
        )
        print(result["quantiles_table"].to_string(index=False))
    return result


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
    quiet: bool = False,
) -> dict[str, object]:
    _configure_stdio()
    resolved_run_date = _resolve_date(run_date, default=loader.today_ept())
    resolved_cutoff_utc = cutoff_utc or loader.default_cutoff_utc(resolved_run_date)
    target_dates = loader.available_target_dates(
        run_date=resolved_run_date,
        horizon_days=horizon_days,
        cutoff_utc=resolved_cutoff_utc,
    )
    cfg = configs.KnnModelConfig(
        model_name=configs.METEO_RTO_HOURLY_SUNNY_SPEC.name,
        hub=hub,
        history_days=history_days,
    )
    pool = build_pool(
        run_date=resolved_run_date,
        history_days=history_days,
        hub=hub,
        load_region=cfg.load_region,
        weather_region=cfg.weather_region,
    )
    pool = _apply_pool_filters(
        pool,
        pool_start_date=pool_start_date,
        pool_year_months=pool_year_months,
    )
    query_frames = build_horizon_query_rows(
        target_dates,
        run_date=resolved_run_date,
        cutoff_utc=resolved_cutoff_utc,
        load_region=cfg.load_region,
        weather_region=cfg.weather_region,
        meteo_region=cfg.meteo_region,
        meteo_forecast_area=cfg.meteo_forecast_area,
    )

    rows: list[dict[str, object]] = []
    forecasts_by_date: dict[str, pd.DataFrame] = {}
    bands_by_date: dict[str, pd.DataFrame] = {}
    analogs_by_date: dict[str, pd.DataFrame] = {}
    results_by_date: dict[str, dict[str, object]] = {}

    for target in target_dates:
        day_cfg = configs.KnnModelConfig(
            forecast_date=target.isoformat(),
            model_name=configs.METEO_RTO_HOURLY_SUNNY_SPEC.name,
            hub=hub,
            history_days=history_days,
        )
        query = query_frames.get(target, pd.DataFrame())
        result = forecast.run_forecast(
            target_date=target,
            query=query,
            pool=pool,
            config=day_cfg,
            feature_group_weights_override=feature_group_weights_override,
        )
        df_forecast = result["df_forecast"]
        assert isinstance(df_forecast, pd.DataFrame)
        rows.append(forecast.build_strip_row(target, df_forecast, resolved_run_date))
        rows[-1]["features_complete"] = _features_complete(query)
        rows[-1]["n_analogs"] = result.get("n_analogs_used", 0)
        forecasts_by_date[target.isoformat()] = df_forecast
        bands = result["quantiles_table"]
        assert isinstance(bands, pd.DataFrame)
        bands_by_date[target.isoformat()] = bands
        analogs = result["analogs"]
        assert isinstance(analogs, pd.DataFrame)
        analogs_by_date[target.isoformat()] = analogs
        results_by_date[target.isoformat()] = result

    strip_table = pd.DataFrame(rows)
    if not quiet:
        window_label = (
            "FULL PREDICTION WINDOW"
            if horizon_days is None
            else f"NEXT {horizon_days} DAYS"
        )
        print(
            f"KNN SUNNY METEO RTO {window_label} | {hub} | "
            f"run_date={resolved_run_date} | pool_rows={len(pool):,}"
        )
        print(f"cutoff_utc={resolved_cutoff_utc}")
        print(strip_table.to_string(index=False))

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
        "results_by_date": results_by_date,
        "n_pool": len(pool),
    }
