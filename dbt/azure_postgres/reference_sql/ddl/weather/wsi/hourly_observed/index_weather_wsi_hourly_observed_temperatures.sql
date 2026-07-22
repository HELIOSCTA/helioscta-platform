-- Source-table indexes for weather.wsi_hourly_observed_temperatures.
--
-- This file is disabled as a dbt model in dbt_project.yml. It is retained as
-- operator reference SQL only. If an operator applies it, use a write-capable
-- role in a SQL editor with autocommit enabled. Do not wrap CREATE/DROP
-- INDEX CONCURRENTLY in BEGIN/COMMIT.

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_weather_wsi_hourly_obs_region_time_key
    ON weather.wsi_hourly_observed_temperatures (
        region,
        observation_time_local DESC,
        station_id
    );

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_weather_wsi_hourly_obs_station_time
    ON weather.wsi_hourly_observed_temperatures (
        station_id,
        observation_time_local DESC
    );

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_weather_wsi_hourly_obs_updated_at
    ON weather.wsi_hourly_observed_temperatures (
        updated_at DESC
    );

-- Cleanup for older deployments that applied former wide/redundant indexes.
DROP INDEX CONCURRENTLY IF EXISTS weather.idx_weather_wsi_hourly_obs_region_time;
DROP INDEX CONCURRENTLY IF EXISTS weather.idx_weather_wsi_hourly_obs_region_station_time;
