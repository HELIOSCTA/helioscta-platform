"""Registry for promoted PJM DA model SQL input artifacts."""

from __future__ import annotations

from dataclasses import asdict, dataclass


@dataclass(frozen=True)
class SqlInputArtifact:
    name: str
    filename: str
    source_tables: tuple[str, ...]
    grain: str
    required_params: tuple[str, ...]
    consuming_model_families: tuple[str, ...]
    input_families: tuple[str, ...] = ()
    freshness_fields: tuple[str, ...] = ()

    def as_diagnostic(self) -> dict[str, object]:
        return asdict(self)


METEO_BASELINE_PRICE = "meteo_baseline_price"
LIKE_DAY_KNN_SUNNY = "like_day_knn_sunny"

SHARED_KNN_INPUT_FAMILIES = ("history_pool", "meteo_rto_hourly", "pjm_rto_hourly")
ALL_KNN_INPUT_FAMILIES = (*SHARED_KNN_INPUT_FAMILIES, "actuals")


SQL_INPUT_ARTIFACTS: dict[str, SqlInputArtifact] = {
    "available_target_dates": SqlInputArtifact(
        name="available_target_dates",
        filename="available_target_dates.sql",
        source_tables=(
            "meteologica.usa_pjm_western_hub_da_power_price_forecast_hourly",
            "meteologica.usa_pjm_western_hub_da_power_price_forecast_ecmwf_ens_hourly",
        ),
        grain="forecast_date with 24-hour deterministic and ENS coverage",
        required_params=("start_date", "cutoff_utc", "limit"),
        consuming_model_families=(METEO_BASELINE_PRICE,),
        input_families=("meteo_da_price",),
        freshness_fields=(
            "det_forecast_execution_datetime_local",
            "ens_forecast_execution_datetime_local",
        ),
    ),
    "meteo_da_price_forecast_hourly": SqlInputArtifact(
        name="meteo_da_price_forecast_hourly",
        filename="meteo_da_price_forecast_hourly.sql",
        source_tables=(
            "meteologica.usa_pjm_western_hub_da_power_price_forecast_hourly",
            "meteologica.usa_pjm_western_hub_da_power_price_forecast_ecmwf_ens_hourly",
        ),
        grain="target_date x hour_ending after latest issue selection",
        required_params=("target_date", "cutoff_utc", "lead_days"),
        consuming_model_families=(METEO_BASELINE_PRICE,),
        input_families=("meteo_da_price",),
        freshness_fields=(
            "det_forecast_execution_datetime_local",
            "ens_forecast_execution_datetime_local",
        ),
    ),
    "actual_da_lmps_hourly": SqlInputArtifact(
        name="actual_da_lmps_hourly",
        filename="actual_da_lmps_hourly.sql",
        source_tables=("pjm.da_hrl_lmps",),
        grain="target_date x hour_ending x hub",
        required_params=("target_date", "hub"),
        consuming_model_families=(METEO_BASELINE_PRICE, LIKE_DAY_KNN_SUNNY),
        input_families=("actuals",),
        freshness_fields=("updated_at",),
    ),
    "actual_da_lmps_hourly_history": SqlInputArtifact(
        name="actual_da_lmps_hourly_history",
        filename="actual_da_lmps_hourly_history.sql",
        source_tables=("pjm.da_hrl_lmps",),
        grain="date x hour_ending x hub",
        required_params=("start_date", "end_date", "hub"),
        consuming_model_families=(LIKE_DAY_KNN_SUNNY,),
        input_families=("history_pool", "actuals"),
        freshness_fields=("updated_at",),
    ),
    "rto_load_hourly_history": SqlInputArtifact(
        name="rto_load_hourly_history",
        filename="rto_load_hourly_history.sql",
        source_tables=("pjm.hrl_load_metered", "pjm.hrl_load_prelim"),
        grain="date x hour_ending x load_region",
        required_params=("start_date", "end_date", "load_region"),
        consuming_model_families=(LIKE_DAY_KNN_SUNNY,),
        input_families=SHARED_KNN_INPUT_FAMILIES,
        freshness_fields=("updated_at",),
    ),
    "rto_load_forecast_hourly_history": SqlInputArtifact(
        name="rto_load_forecast_hourly_history",
        filename="rto_load_forecast_hourly_history.sql",
        source_tables=("pjm.load_frcstd_7_day",),
        grain="date x hour_ending x load_region x lead_days",
        required_params=("start_date", "end_date", "load_region", "lead_days"),
        consuming_model_families=(LIKE_DAY_KNN_SUNNY,),
        input_families=("history_pool", "pjm_rto_hourly"),
        freshness_fields=("forecast_datetime_beginning_ept",),
    ),
    "rto_load_latest_forecast_hourly": SqlInputArtifact(
        name="rto_load_latest_forecast_hourly",
        filename="rto_load_latest_forecast_hourly.sql",
        source_tables=("pjm.load_frcstd_7_day",),
        grain="date x hour_ending x load_region after cutoff-bounded issue selection",
        required_params=("start_date", "end_date", "cutoff_utc", "load_region"),
        consuming_model_families=(LIKE_DAY_KNN_SUNNY,),
        input_families=(),
        freshness_fields=("forecast_datetime_beginning_ept",),
    ),
    "renewables_hourly_history": SqlInputArtifact(
        name="renewables_hourly_history",
        filename="renewables_hourly_history.sql",
        source_tables=(
            "pjm.gen_by_fuel",
            "pjm.solar_gen",
            "pjm.five_min_solar_generation",
            "pjm.wind_gen",
            "pjm.hourly_solar_power_forecast",
            "pjm.hourly_wind_power_forecast",
        ),
        grain="date x hour_ending",
        required_params=("start_date", "end_date"),
        consuming_model_families=(LIKE_DAY_KNN_SUNNY,),
        input_families=("history_pool", "pjm_rto_hourly"),
        freshness_fields=("updated_at",),
    ),
    "renewables_latest_forecast_hourly": SqlInputArtifact(
        name="renewables_latest_forecast_hourly",
        filename="renewables_latest_forecast_hourly.sql",
        source_tables=(
            "pjm.hourly_solar_power_forecast",
            "pjm.hourly_wind_power_forecast",
        ),
        grain="date x hour_ending after cutoff-bounded issue selection",
        required_params=("start_date", "end_date", "cutoff_utc"),
        consuming_model_families=(LIKE_DAY_KNN_SUNNY,),
        input_families=(),
        freshness_fields=("forecast_datetime_beginning_ept",),
    ),
    "gen_outages_daily_history": SqlInputArtifact(
        name="gen_outages_daily_history",
        filename="gen_outages_daily_history.sql",
        source_tables=("pjm.gen_outages_by_type",),
        grain="date x region x lead_days after latest issue selection",
        required_params=("start_date", "end_date", "region", "lead_days"),
        consuming_model_families=(LIKE_DAY_KNN_SUNNY,),
        input_families=SHARED_KNN_INPUT_FAMILIES,
        freshness_fields=("forecast_execution_date_ept",),
    ),
    "gen_outages_daily_latest_forecast": SqlInputArtifact(
        name="gen_outages_daily_latest_forecast",
        filename="gen_outages_daily_latest_forecast.sql",
        source_tables=("pjm.gen_outages_by_type",),
        grain="date x region after cutoff-date latest issue selection",
        required_params=("start_date", "end_date", "cutoff_date", "region"),
        consuming_model_families=(LIKE_DAY_KNN_SUNNY,),
        input_families=("meteo_rto_hourly",),
        freshness_fields=("forecast_execution_date_ept",),
    ),
    "meteo_pjm_rto_latest_forecast_hourly": SqlInputArtifact(
        name="meteo_pjm_rto_latest_forecast_hourly",
        filename="meteo_pjm_rto_latest_forecast_hourly.sql",
        source_tables=("meteologica.pjm_forecast_hourly",),
        grain="date x hour_ending x region x forecast_area after cutoff-bounded issue selection",
        required_params=("start_date", "end_date", "cutoff_utc", "region", "forecast_area"),
        consuming_model_families=(LIKE_DAY_KNN_SUNNY,),
        input_families=("meteo_rto_hourly",),
        freshness_fields=("forecast_execution_datetime_utc",),
    ),
    "meteo_pjm_rto_forecast_hourly_history": SqlInputArtifact(
        name="meteo_pjm_rto_forecast_hourly_history",
        filename="meteo_pjm_rto_forecast_hourly_history.sql",
        source_tables=("meteologica.pjm_forecast_hourly",),
        grain="date x hour_ending x region x forecast_area x lead_days",
        required_params=("start_date", "end_date", "region", "forecast_area", "lead_days"),
        consuming_model_families=(LIKE_DAY_KNN_SUNNY,),
        input_families=("history_pool", "pjm_rto_hourly"),
        freshness_fields=("forecast_execution_datetime_utc",),
    ),
    "wsi_temperature_hourly_history": SqlInputArtifact(
        name="wsi_temperature_hourly_history",
        filename="wsi_temperature_hourly_history.sql",
        source_tables=("weather.wsi_hourly_observed_temperatures",),
        grain="date x hour_ending x region",
        required_params=("start_date", "end_date", "region"),
        consuming_model_families=(LIKE_DAY_KNN_SUNNY,),
        input_families=SHARED_KNN_INPUT_FAMILIES,
        freshness_fields=("created_at",),
    ),
    "wsi_temperature_hourly_latest_forecast": SqlInputArtifact(
        name="wsi_temperature_hourly_latest_forecast",
        filename="wsi_temperature_hourly_latest_forecast.sql",
        source_tables=("weather.wsi_hourly_forecasts",),
        grain="date x hour_ending x region after cutoff-bounded issue selection",
        required_params=("start_date", "end_date", "cutoff_utc", "region"),
        consuming_model_families=(LIKE_DAY_KNN_SUNNY,),
        input_families=("meteo_rto_hourly", "pjm_rto_hourly"),
        freshness_fields=("forecast_issued_at_utc",),
    ),
    "ice_python_next_day_gas": SqlInputArtifact(
        name="ice_python_next_day_gas",
        filename="ice_python_next_day_gas.sql",
        source_tables=("ice_python.settlements",),
        grain="gas_day x gas hub after next-day/weekend settlement alignment",
        required_params=("start_date", "end_date"),
        consuming_model_families=(LIKE_DAY_KNN_SUNNY,),
        input_families=("history_pool",),
        freshness_fields=("updated_at",),
    ),
    "ice_python_next_day_gas_pjm_features": SqlInputArtifact(
        name="ice_python_next_day_gas_pjm_features",
        filename="ice_python_next_day_gas_pjm_features.sql",
        source_tables=("ice_python.settlements",),
        grain="date x gas feature after next-day/weekend settlement alignment",
        required_params=("start_date", "end_date"),
        consuming_model_families=(LIKE_DAY_KNN_SUNNY,),
        input_families=("history_pool",),
        freshness_fields=("updated_at",),
    ),
    "ice_python_next_day_gas_hourly": SqlInputArtifact(
        name="ice_python_next_day_gas_hourly",
        filename="ice_python_next_day_gas_hourly.sql",
        source_tables=("ice_python.settlements",),
        grain="date x hour_ending x gas feature after next-day/weekend settlement alignment",
        required_params=("start_date", "end_date"),
        consuming_model_families=(LIKE_DAY_KNN_SUNNY,),
        input_families=SHARED_KNN_INPUT_FAMILIES,
        freshness_fields=("updated_at",),
    ),
}


def artifacts_for(
    *,
    model_family: str,
    input_family: str | None = None,
    include_actuals: bool = True,
) -> tuple[SqlInputArtifact, ...]:
    input_family_names = set()
    if input_family is not None:
        input_family_names.add(input_family)
    input_family_names.add("history_pool")
    if include_actuals:
        input_family_names.add("actuals")

    artifacts: list[SqlInputArtifact] = []
    for artifact in SQL_INPUT_ARTIFACTS.values():
        if model_family not in artifact.consuming_model_families:
            continue
        if input_family is None or input_family_names.intersection(artifact.input_families):
            artifacts.append(artifact)
    return tuple(artifacts)


def artifact_filenames_for(
    *,
    model_family: str,
    input_family: str | None = None,
    include_actuals: bool = True,
) -> tuple[str, ...]:
    return tuple(
        artifact.filename
        for artifact in artifacts_for(
            model_family=model_family,
            input_family=input_family,
            include_actuals=include_actuals,
        )
    )


def artifact_diagnostics(
    *,
    model_family: str,
    input_family: str | None = None,
    include_actuals: bool = True,
) -> list[dict[str, object]]:
    return [
        artifact.as_diagnostic()
        for artifact in artifacts_for(
            model_family=model_family,
            input_family=input_family,
            include_actuals=include_actuals,
        )
    ]
