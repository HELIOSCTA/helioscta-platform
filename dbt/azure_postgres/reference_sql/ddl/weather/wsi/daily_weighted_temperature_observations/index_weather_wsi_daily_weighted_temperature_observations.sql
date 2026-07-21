-- Source-table indexes for weather.wsi_daily_weighted_temperature_observations.
--
-- This file is disabled as a dbt model in dbt_project.yml. It is retained as
-- operator reference SQL only. If an operator applies it, use a write-capable
-- role in a SQL editor with autocommit enabled. Do not wrap CREATE INDEX
-- CONCURRENTLY in BEGIN/COMMIT.

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_weather_wsi_daily_weighted_temp_obs_latest
    ON weather.wsi_daily_weighted_temperature_observations (
        request_region,
        entity_id,
        observation_date DESC,
        metric_name
    )
    INCLUDE (
        metric_value,
        metric_unit,
        temp_units,
        updated_at
    );

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_weather_wsi_daily_weighted_temp_obs_metric
    ON weather.wsi_daily_weighted_temperature_observations (
        request_region,
        observation_date DESC,
        metric_name,
        entity_id
    );

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_weather_wsi_daily_weighted_temp_obs_updated
    ON weather.wsi_daily_weighted_temperature_observations (
        updated_at DESC
    );
