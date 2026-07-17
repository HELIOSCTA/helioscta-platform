-- Source-table DDL for weather.wsi_hourly_forecasts.
--
-- This file is disabled as a dbt model in dbt_project.yml. It is retained as
-- operator reference SQL only. Read-only dbt credentials cannot run this.
-- Apply it manually with the helios_admin role before scheduling
-- backend.scrapes.weather.wsi.hourly_forecast.
--
-- Source system: WSI Trader Hourly Forecast, GetHourlyForecast.
-- Grain: station_id x region x forecast_issued_at_utc x forecast_time_utc.

CREATE TABLE IF NOT EXISTS weather.wsi_hourly_forecasts (
    station_id VARCHAR NOT NULL,
    station_name VARCHAR NOT NULL,
    region VARCHAR NOT NULL,
    forecast_issued_at_utc TIMESTAMPTZ NOT NULL,
    forecast_time_utc TIMESTAMPTZ NOT NULL,
    temp_f DOUBLE PRECISION,
    temp_diff_f DOUBLE PRECISION,
    temp_normal_f DOUBLE PRECISION,
    dew_point_f DOUBLE PRECISION,
    cloud_cover_pct DOUBLE PRECISION,
    feels_like_f DOUBLE PRECISION,
    feels_like_diff_f DOUBLE PRECISION,
    precip_in DOUBLE PRECISION,
    wind_dir_degrees DOUBLE PRECISION,
    wind_speed_mph DOUBLE PRECISION,
    ghi_irradiance DOUBLE PRECISION,
    probability_of_precip_pct DOUBLE PRECISION,
    relative_humidity_pct DOUBLE PRECISION,
    source_product_id VARCHAR NOT NULL DEFAULT 'HOURLY_FORECAST',
    source_banner VARCHAR,
    scrape_run_at_utc TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (
        station_id,
        region,
        forecast_issued_at_utc,
        forecast_time_utc
    )
);
