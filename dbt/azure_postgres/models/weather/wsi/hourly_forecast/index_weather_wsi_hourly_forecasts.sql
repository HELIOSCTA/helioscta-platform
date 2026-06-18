-- Source-table indexes for weather.wsi_hourly_forecasts.
--
-- This file is disabled as a dbt model in dbt_project.yml. It is retained as
-- operator reference SQL only. If an operator applies it, use a write-capable
-- role in a SQL editor with autocommit enabled. Do not wrap CREATE INDEX
-- CONCURRENTLY in BEGIN/COMMIT.

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_weather_wsi_hourly_fcst_latest
    ON weather.wsi_hourly_forecasts (
        region,
        station_id,
        forecast_issued_at_utc DESC,
        forecast_time_utc
    )
    INCLUDE (
        station_name,
        temp_f,
        temp_diff_f,
        temp_normal_f,
        dew_point_f,
        cloud_cover_pct,
        feels_like_f,
        feels_like_diff_f,
        precip_in,
        wind_dir_degrees,
        wind_speed_mph,
        ghi_irradiance,
        probability_of_precip_pct,
        relative_humidity_pct,
        updated_at
    );

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_weather_wsi_hourly_fcst_valid_time
    ON weather.wsi_hourly_forecasts (
        region,
        forecast_time_utc,
        station_id,
        forecast_issued_at_utc DESC
    );

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_weather_wsi_hourly_fcst_updated_at
    ON weather.wsi_hourly_forecasts (
        updated_at DESC
    );

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_weather_wsi_hourly_fcst_issue
    ON weather.wsi_hourly_forecasts (
        forecast_issued_at_utc DESC
    );
