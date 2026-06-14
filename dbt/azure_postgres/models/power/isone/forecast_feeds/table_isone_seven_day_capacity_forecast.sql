-- Source-table DDL for isone.seven_day_capacity_forecast.
-- Disabled in dbt_project.yml; apply with helios_admin before scheduling.

CREATE TABLE IF NOT EXISTS isone.seven_day_capacity_forecast (
    forecast_execution_date DATE NOT NULL,
    date DATE NOT NULL,
    high_temperature_boston DOUBLE PRECISION,
    dew_point_boston DOUBLE PRECISION,
    high_temperature_hartford DOUBLE PRECISION,
    dew_point_hartford DOUBLE PRECISION,
    total_capacity_supply_obligation DOUBLE PRECISION,
    anticipated_cold_weather_outages DOUBLE PRECISION,
    other_generation_outages DOUBLE PRECISION,
    anticipated_de_list_mw_offered DOUBLE PRECISION,
    total_generation_available DOUBLE PRECISION,
    import_at_time_of_peak DOUBLE PRECISION,
    total_available_generation_and_imports DOUBLE PRECISION,
    projected_peak_load DOUBLE PRECISION,
    replacement_reserve_requirement DOUBLE PRECISION,
    required_reserve DOUBLE PRECISION,
    required_reserve_including_replacement DOUBLE PRECISION,
    total_load_plus_required_reserve DOUBLE PRECISION,
    projected_surplus_deficiency DOUBLE PRECISION,
    available_demand_response_resources DOUBLE PRECISION,
    power_watch VARCHAR,
    power_warning VARCHAR,
    cold_weather_watch VARCHAR,
    cold_weather_warning VARCHAR,
    cold_weather_event VARCHAR,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (
        forecast_execution_date,
        date
    )
);
