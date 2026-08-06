"""Configuration for the backend helios_prod-backed KNN Sunny model."""

from __future__ import annotations

import copy
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from typing import Any
from zoneinfo import ZoneInfo

from . import domains


HUB: str = "WESTERN HUB"
LOAD_REGION: str = "RTO"
WEATHER_REGION: str = "PJM"
METEO_REGION: str = "PJM"
METEO_FORECAST_AREA: str = "RTO"

DEFAULT_HISTORY_DAYS: int = 730
DEFAULT_N_ANALOGS: int = 20
MIN_POOL_SIZE: int = 30
SEASON_WINDOW_DAYS: int = 60
RECENCY_HALF_LIFE_DAYS: float = 3650.0
LABEL_SOURCE: str = "hub_lmp"
QUANTILES: list[float] = [
    0.01,
    0.05,
    0.10,
    0.25,
    0.375,
    0.50,
    0.625,
    0.75,
    0.90,
    0.95,
    0.99,
]
DISPLAY_QUANTILES: list[float] = [0.25, 0.375, 0.50, 0.625, 0.75]
ONPEAK_HOURS: tuple[int, ...] = tuple(range(8, 24))
OFFPEAK_HOURS: tuple[int, ...] = tuple(list(range(1, 8)) + [24])
HOURS: tuple[int, ...] = tuple(range(1, 25))
ANALOG_RANK_HOURS: tuple[int, ...] = ONPEAK_HOURS
EASTERN_TZ = ZoneInfo("America/New_York")

DAY_TYPE_WEEKDAY: str = "weekday"
DAY_TYPE_SATURDAY: str = "saturday"
DAY_TYPE_SUNDAY: str = "sunday"

DAY_TYPE_SCENARIO_PROFILES: dict[str, dict[str, Any]] = {
    DAY_TYPE_WEEKDAY: {},
    DAY_TYPE_SATURDAY: {
        "same_dow_group": True,
        "season_window_days": 45,
        "n_analogs": 12,
    },
    DAY_TYPE_SUNDAY: {
        "same_dow_group": True,
        "season_window_days": 60,
        "n_analogs": 10,
    },
}


def _day_type_for(d: date) -> str:
    weekday = d.weekday()
    if weekday == 5:
        return DAY_TYPE_SATURDAY
    if weekday == 6:
        return DAY_TYPE_SUNDAY
    return DAY_TYPE_WEEKDAY


@dataclass(frozen=True)
class ModelSpec:
    name: str
    description: str
    feature_groups: dict[str, list[str]]
    raw_feature_group_weights: dict[str, float]

    @property
    def feature_group_weights(self) -> dict[str, float]:
        total = sum(self.raw_feature_group_weights.values())
        if total <= 0:
            return dict(self.raw_feature_group_weights)
        return {
            key: value / total
            for key, value in self.raw_feature_group_weights.items()
        }

    @property
    def feature_columns(self) -> list[str]:
        return domains.feature_columns()


PJM_RTO_HOURLY_SUNNY_SPEC = ModelSpec(
    name="pjm_rto_hourly_sunny",
    description=(
        "Scalar per-hour KNN Sunny model fed by helios_prod PJM/WSI "
        "historical inputs plus ICE Python next-day gas marks. The single-day "
        "query path uses PJM forward load/renewable forecasts available by "
        "the 10:00 EPT cutoff, with Meteologica renewable fallback."
    ),
    feature_groups=domains.FEATURE_GROUPS,
    raw_feature_group_weights=domains.RAW_FEATURE_GROUP_WEIGHTS,
)

METEO_RTO_HOURLY_SUNNY_SPEC = ModelSpec(
    name="meteo_rto_hourly_sunny",
    description=(
        "Scalar per-hour KNN Sunny model fed by helios_prod source SQL: "
        "historical PJM RTO/load/weather/renewables/outages plus latest "
        "Meteologica RTO load/solar/wind forecast and ICE Python next-day gas "
        "marks for the query horizon."
    ),
    feature_groups=domains.FEATURE_GROUPS,
    raw_feature_group_weights=domains.RAW_FEATURE_GROUP_WEIGHTS,
)

MODEL_REGISTRY: dict[str, ModelSpec] = {
    PJM_RTO_HOURLY_SUNNY_SPEC.name: PJM_RTO_HOURLY_SUNNY_SPEC,
    METEO_RTO_HOURLY_SUNNY_SPEC.name: METEO_RTO_HOURLY_SUNNY_SPEC,
}
DEFAULT_MODEL: str = METEO_RTO_HOURLY_SUNNY_SPEC.name


@dataclass
class KnnModelConfig:
    forecast_date: str | None = None
    model_name: str = DEFAULT_MODEL
    n_analogs: int = DEFAULT_N_ANALOGS
    quantiles: list[float] | None = None
    display_quantiles: list[float] | None = None
    season_window_days: int = SEASON_WINDOW_DAYS
    min_pool_size: int = MIN_POOL_SIZE
    hub: str = HUB
    load_region: str = LOAD_REGION
    weather_region: str = WEATHER_REGION
    meteo_region: str = METEO_REGION
    meteo_forecast_area: str = METEO_FORECAST_AREA
    history_days: int = DEFAULT_HISTORY_DAYS
    recency_half_life_days: float = RECENCY_HALF_LIFE_DAYS
    label_source: str = LABEL_SOURCE
    same_dow_group: bool = False
    same_weekend_group: bool = False
    same_weekend_group_for_weekends: bool = False
    exclude_holidays: bool = True
    exclude_dates: list[str] | None = None
    use_day_type_profiles: bool = True
    day_type_profiles: dict[str, dict[str, Any]] | None = None

    def resolved_target_date(self) -> date:
        if self.forecast_date:
            return date.fromisoformat(self.forecast_date)
        return datetime.now(EASTERN_TZ).date() + timedelta(days=1)

    def resolved_quantiles(self) -> list[float]:
        return list(self.quantiles) if self.quantiles is not None else list(QUANTILES)

    def resolved_display_quantiles(self) -> list[float]:
        if self.display_quantiles is not None:
            return list(self.display_quantiles)
        return list(DISPLAY_QUANTILES)

    def resolved_spec(self) -> ModelSpec:
        if self.model_name not in MODEL_REGISTRY:
            raise ValueError(
                f"Unknown model {self.model_name!r}. "
                f"Available: {sorted(MODEL_REGISTRY)}"
            )
        return MODEL_REGISTRY[self.model_name]

    def resolved_day_type_profiles(self) -> dict[str, dict[str, Any]]:
        profiles = copy.deepcopy(DAY_TYPE_SCENARIO_PROFILES)
        if not self.day_type_profiles:
            return profiles
        for key, values in self.day_type_profiles.items():
            profiles.setdefault(key, {})
            profiles[key].update(copy.deepcopy(values))
        return profiles

    def with_day_type_overrides(self, target_date: date) -> tuple["KnnModelConfig", str]:
        day_type = _day_type_for(target_date)
        if not self.use_day_type_profiles:
            return self, day_type
        profile = self.resolved_day_type_profiles().get(day_type, {})
        if not profile:
            return self, day_type
        config = copy.deepcopy(self)
        for key, value in profile.items():
            if hasattr(config, key):
                setattr(config, key, copy.deepcopy(value))
        return config, day_type
