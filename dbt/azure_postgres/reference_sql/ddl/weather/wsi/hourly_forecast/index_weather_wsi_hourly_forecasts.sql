-- Source-table indexes for weather.wsi_hourly_forecasts.
--
-- This file is disabled as a dbt model in dbt_project.yml. It is retained as
-- operator reference SQL only. If an operator applies it, use a write-capable
-- role in a SQL editor with autocommit enabled. Do not wrap CREATE/DROP
-- INDEX CONCURRENTLY in BEGIN/COMMIT.

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_weather_wsi_hourly_fcst_latest_key
    ON weather.wsi_hourly_forecasts (
        region,
        station_id,
        forecast_issued_at_utc DESC,
        forecast_time_utc
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

-- Cleanup for older deployments that applied the former wide covering index.
DROP INDEX CONCURRENTLY IF EXISTS weather.idx_weather_wsi_hourly_fcst_latest;
