-- Derived-table indexes for weather.wsi_daily_weighted_degree_day_10yr_normals.
--
-- This file is disabled as a dbt model in dbt_project.yml. It is retained as
-- operator reference SQL only. If an operator applies it, use a write-capable
-- role in a SQL editor with autocommit enabled. Do not wrap CREATE INDEX
-- CONCURRENTLY in BEGIN/COMMIT.

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_weather_wsi_daily_weighted_dd_10yr_normals_latest
    ON weather.wsi_daily_weighted_degree_day_10yr_normals (
        request_region,
        entity_id,
        metric_name,
        calendar_month,
        calendar_day,
        normal_window_end_year DESC,
        lookback_years
    )
    INCLUDE (
        normal_value,
        metric_unit,
        sample_year_count,
        sample_day_count,
        computed_at_utc,
        updated_at
    );

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_weather_wsi_daily_weighted_dd_10yr_normals_window
    ON weather.wsi_daily_weighted_degree_day_10yr_normals (
        normal_window_end_year DESC,
        lookback_years,
        request_region,
        entity_id,
        metric_name
    );

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_weather_wsi_daily_weighted_dd_10yr_normals_updated
    ON weather.wsi_daily_weighted_degree_day_10yr_normals (
        updated_at DESC
    );
