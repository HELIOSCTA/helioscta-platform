-- Source-table indexes for weather.wsi_daily_weighted_degree_day_forecasts.
--
-- This file is disabled as a dbt model in dbt_project.yml. It is retained as
-- operator reference SQL only. If an operator applies it, use a write-capable
-- role in a SQL editor with autocommit enabled. Do not wrap CREATE INDEX
-- CONCURRENTLY in BEGIN/COMMIT.

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_weather_wsi_daily_weighted_dd_latest
    ON weather.wsi_daily_weighted_degree_day_forecasts (
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
        updated_at
    );

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_weather_wsi_daily_weighted_dd_date_metric
    ON weather.wsi_daily_weighted_degree_day_forecasts (
        request_region,
        entity_id,
        forecast_date,
        metric_name,
        source_issue_at_utc DESC NULLS LAST
    );

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_weather_wsi_daily_weighted_dd_issue_cutoff
    ON weather.wsi_daily_weighted_degree_day_forecasts (
        (COALESCE(source_issue_at_utc, scrape_run_at_utc)) DESC,
        source_issue_key,
        model,
        forecast_type,
        request_region
    );

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_weather_wsi_daily_weighted_dd_latest_model_cycle
    ON weather.wsi_daily_weighted_degree_day_forecasts (
        request_region,
        model,
        bias_corrected,
        forecast_type,
        model_run_cycle,
        source_issue_at_utc DESC NULLS LAST,
        scrape_run_at_utc DESC
    )
    INCLUDE (
        source_issue_key,
        source_init_at_utc,
        source_init_cycle,
        updated_at
    );

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_weather_wsi_daily_weighted_dd_entity_metric_date_compare
    ON weather.wsi_daily_weighted_degree_day_forecasts (
        request_region,
        model,
        bias_corrected,
        forecast_type,
        entity_id,
        metric_name,
        forecast_date,
        model_run_cycle,
        source_issue_at_utc DESC NULLS LAST
    )
    INCLUDE (
        metric_value,
        metric_unit,
        source_issue_key,
        source_init_cycle,
        forecast_day,
        updated_at
    );

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_weather_wsi_daily_weighted_dd_updated
    ON weather.wsi_daily_weighted_degree_day_forecasts (
        updated_at DESC
    );
