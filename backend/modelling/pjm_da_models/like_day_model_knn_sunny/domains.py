"""Feature groups for the helios_prod-backed KNN Sunny model."""

from __future__ import annotations


FEATURE_GROUPS: dict[str, list[str]] = {
    "load_at_hour": ["load_mw_at_hour"],
    "load_ramp_1h_at_hour": ["load_ramp_1h_at_hour"],
    "load_ramp_3h_at_hour": ["load_ramp_3h_at_hour"],
    "weather_at_hour": ["temp_at_hour"],
    "renewable_at_hour": ["solar_at_hour", "wind_at_hour"],
    "net_load_at_hour": ["net_load_at_hour"],
    "outage_daily": ["outage_total_mw"],
    "gas_daily": ["gas_m3_daily_avg"],
    "calendar": ["is_weekend", "dow_sin", "dow_cos"],
}

RAW_FEATURE_GROUP_WEIGHTS: dict[str, float] = {
    "load_at_hour": 3.0,
    "load_ramp_1h_at_hour": 1.5,
    "load_ramp_3h_at_hour": 1.5,
    "weather_at_hour": 2.0,
    "renewable_at_hour": 1.5,
    "net_load_at_hour": 2.0,
    "outage_daily": 3.0,
    "gas_daily": 2.0,
    "calendar": 1.0,
}

DAILY_BROADCAST_COLUMNS: tuple[str, ...] = (
    "outage_total_mw",
    "gas_m3_daily_avg",
)

CALENDAR_COLUMNS: tuple[str, ...] = (
    "day_of_week_number",
    "is_nerc_holiday",
    "is_weekend",
    "dow_sin",
    "dow_cos",
)


def normalized_feature_group_weights() -> dict[str, float]:
    total = sum(RAW_FEATURE_GROUP_WEIGHTS.values())
    return {key: value / total for key, value in RAW_FEATURE_GROUP_WEIGHTS.items()}


def feature_columns() -> list[str]:
    seen: list[str] = []
    for columns in FEATURE_GROUPS.values():
        for column in columns:
            if column not in seen:
                seen.append(column)
    return seen


MODEL_COLUMNS: tuple[str, ...] = (
    "date",
    "hour_ending",
    *feature_columns(),
    *[
        column
        for column in CALENDAR_COLUMNS
        if column not in feature_columns()
    ],
)
