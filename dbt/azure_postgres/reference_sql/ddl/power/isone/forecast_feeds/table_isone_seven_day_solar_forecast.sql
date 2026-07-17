-- Source-table DDL for isone.seven_day_solar_forecast.
-- Disabled in dbt_project.yml; apply with helios_admin before scheduling.

CREATE TABLE IF NOT EXISTS isone.seven_day_solar_forecast (
    forecast_execution_date DATE NOT NULL,
    forecast_date DATE NOT NULL,
    hour_ending INTEGER NOT NULL,
    solar_forecast_mw DOUBLE PRECISION,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (
        forecast_execution_date,
        forecast_date,
        hour_ending
    )
);
