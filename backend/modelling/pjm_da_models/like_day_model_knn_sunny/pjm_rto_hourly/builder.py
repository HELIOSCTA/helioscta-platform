"""Pool and query builders for PJM-backed KNN Sunny historical runs."""

from __future__ import annotations

from datetime import date

import pandas as pd

from .. import configs, domains, loader


def build_pool(
    *,
    run_date: date | str | None = None,
    history_days: int = configs.DEFAULT_HISTORY_DAYS,
    hub: str = configs.HUB,
    load_region: str = configs.LOAD_REGION,
    weather_region: str = configs.WEATHER_REGION,
) -> pd.DataFrame:
    return loader.build_pool_frame(
        run_date=run_date,
        history_days=history_days,
        hub=hub,
        load_region=load_region,
        weather_region=weather_region,
    )


def build_query_row(
    target_date: date,
    *,
    pool: pd.DataFrame,
    run_date: date | str | None = None,
    cutoff_utc: str | None = None,
    load_region: str = configs.LOAD_REGION,
    weather_region: str = configs.WEATHER_REGION,
    meteo_region: str = configs.METEO_REGION,
    meteo_forecast_area: str = configs.METEO_FORECAST_AREA,
) -> pd.DataFrame:
    """Return PJM-backed target features from pool history or forward inputs."""
    query = pool[
        pd.to_datetime(pool["date"], errors="coerce").dt.date == target_date
    ].copy()
    if query.empty:
        query = loader.build_pjm_query_frames(
            target_dates=[target_date],
            run_date=run_date,
            cutoff_utc=cutoff_utc,
            load_region=load_region,
            weather_region=weather_region,
            meteo_region=meteo_region,
            meteo_forecast_area=meteo_forecast_area,
        ).get(target_date, pd.DataFrame())
    if query.empty:
        raise ValueError(f"No PJM-backed feature rows found for target_date={target_date}.")
    keep = list(domains.MODEL_COLUMNS)
    for column in keep:
        if column not in query.columns:
            query[column] = pd.NA
    return (
        query[keep]
        .drop_duplicates(subset=["date", "hour_ending"], keep="last")
        .sort_values("hour_ending")
        .reset_index(drop=True)
    )
