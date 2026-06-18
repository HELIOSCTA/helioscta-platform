-- Source-table indexes for weather.wsi_hourly_observed_temperatures.
--
-- This file is disabled as a dbt model in dbt_project.yml. It is retained as
-- operator reference SQL only. If an operator applies it, use a write-capable
-- role in a SQL editor with autocommit enabled. Do not wrap CREATE INDEX
-- CONCURRENTLY in BEGIN/COMMIT.

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_weather_wsi_hourly_obs_region_time
    ON weather.wsi_hourly_observed_temperatures (
        region,
        observation_time_local DESC,
        station_id
    )
    INCLUDE (
        station_name,
        temp_f,
        dew_point_f,
        feels_like_f,
        wind_speed_mph,
        wind_dir_degrees,
        cloud_cover_pct,
        precip_in,
        updated_at
    );

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_weather_wsi_hourly_obs_region_station_time
    ON weather.wsi_hourly_observed_temperatures (
        region,
        station_id,
        observation_time_local DESC
    )
    INCLUDE (
        station_name
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
