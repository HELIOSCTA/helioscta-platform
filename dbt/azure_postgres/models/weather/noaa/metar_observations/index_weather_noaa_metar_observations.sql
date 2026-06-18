-- Source-table indexes for weather.noaa_metar_observations.
--
-- This file is disabled as a dbt model in dbt_project.yml. It is retained as
-- operator reference SQL only. If an operator applies it, use a write-capable
-- role in a SQL editor with autocommit enabled. Do not wrap CREATE INDEX
-- CONCURRENTLY in BEGIN/COMMIT.

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_weather_noaa_metar_region_time
    ON weather.noaa_metar_observations (
        region,
        observation_time_utc DESC,
        station_id
    )
    INCLUDE (
        station_name,
        temp_f,
        dew_point_f,
        feels_like_f,
        wind_speed_mph,
        wind_gust_mph,
        wind_dir_degrees,
        pressure_mb,
        visibility_miles,
        updated_at
    );

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_weather_noaa_metar_station_time
    ON weather.noaa_metar_observations (
        station_id,
        observation_time_utc DESC
    );

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_weather_noaa_metar_updated_at
    ON weather.noaa_metar_observations (
        updated_at DESC
    );
