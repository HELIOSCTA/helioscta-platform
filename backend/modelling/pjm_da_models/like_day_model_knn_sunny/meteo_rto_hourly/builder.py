"""Pool and query builders for the Meteologica-fed KNN Sunny variant."""

from __future__ import annotations

from datetime import date

import pandas as pd

from .. import configs, loader


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


def build_horizon_query_rows(
    target_dates: list[date] | tuple[date, ...],
    *,
    run_date: date | str | None = None,
    cutoff_utc: str | None = None,
    load_region: str = configs.LOAD_REGION,
    weather_region: str = configs.WEATHER_REGION,
    meteo_region: str = configs.METEO_REGION,
    meteo_forecast_area: str = configs.METEO_FORECAST_AREA,
) -> dict[date, pd.DataFrame]:
    return loader.build_horizon_query_frames(
        target_dates=target_dates,
        run_date=run_date,
        cutoff_utc=cutoff_utc,
        load_region=load_region,
        weather_region=weather_region,
        meteo_region=meteo_region,
        meteo_forecast_area=meteo_forecast_area,
    )
