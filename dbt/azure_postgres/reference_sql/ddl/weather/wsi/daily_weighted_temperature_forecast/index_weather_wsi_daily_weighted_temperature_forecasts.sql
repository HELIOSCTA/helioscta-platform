-- Source-table indexes for weather.wsi_daily_weighted_temperature_forecasts.
--
-- This file is disabled as a dbt model in dbt_project.yml. It is retained as
-- operator reference SQL only. If an operator applies it, use a write-capable
-- role in a SQL editor with autocommit enabled. Do not wrap CREATE INDEX
-- CONCURRENTLY in BEGIN/COMMIT.

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_weather_wsi_daily_weighted_temp_latest
    ON weather.wsi_daily_weighted_temperature_forecasts (
        request_region,
        entity_id,
        source_issue_at_utc DESC NULLS LAST,
        scrape_run_at_utc DESC,
        forecast_date,
        metric_name
    )
    INCLUDE (
        metric_value,
        metric_unit,
        model,
        forecast_type,
        temp_units,
        updated_at
    );

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_weather_wsi_daily_weighted_temp_date_metric
    ON weather.wsi_daily_weighted_temperature_forecasts (
        request_region,
        entity_id,
        forecast_date,
        metric_name,
        source_issue_at_utc DESC NULLS LAST
    );

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_weather_wsi_daily_weighted_temp_updated
    ON weather.wsi_daily_weighted_temperature_forecasts (
        updated_at DESC
    );
