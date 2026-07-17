-- Index DDL for ISO-NE forecast feeds.
-- Disabled in dbt_project.yml; apply with helios_admin after table SQL.

CREATE INDEX IF NOT EXISTS idx_isone_tdrdf_forecast_date_hour_region
ON isone.three_day_reliability_region_demand_forecast (
    forecast_date,
    hour_ending,
    reliability_region
);

CREATE INDEX IF NOT EXISTS idx_isone_seven_day_capacity_forecast_date
ON isone.seven_day_capacity_forecast (
    date
);

CREATE INDEX IF NOT EXISTS idx_isone_seven_day_wind_forecast_date_hour
ON isone.seven_day_wind_forecast (
    forecast_date,
    hour_ending
);

CREATE INDEX IF NOT EXISTS idx_isone_seven_day_solar_forecast_date_hour
ON isone.seven_day_solar_forecast (
    forecast_date,
    hour_ending
);
