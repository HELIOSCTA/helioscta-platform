-- Source-table DDL for isone.three_day_reliability_region_demand_forecast.
-- Disabled in dbt_project.yml; apply with helios_admin before scheduling.

CREATE TABLE IF NOT EXISTS isone.three_day_reliability_region_demand_forecast (
    published_date TIMESTAMP NOT NULL,
    forecast_date DATE NOT NULL,
    hour_ending INTEGER NOT NULL,
    reliability_region VARCHAR NOT NULL,
    mw DOUBLE PRECISION,
    percentage DOUBLE PRECISION,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (
        published_date,
        forecast_date,
        hour_ending,
        reliability_region
    )
);
