-- Source-table DDL for weather.wsi_daily_weighted_degree_day_forecasts.
--
-- This file is disabled as a dbt model in dbt_project.yml. It is retained as
-- operator reference SQL only. Read-only dbt credentials cannot run this.
-- Apply it manually with the helios_admin role before scheduling
-- backend.orchestration.weather.wsi.daily_weighted_forecasts.
--
-- Source system: WSI Trader GetWeightedDegreeDayForecast.
-- Source product: WEIGHTED_DEGREE_DAY_FORECAST.
-- Grain:
--   source_issue_key x model x forecast_type x request_region x entity_id
--   x forecast_date x metric_name.
-- Safe rerun key: primary key below.
-- Freshness field: source_issue_at_utc when parseable, otherwise
-- scrape_run_at_utc and deterministic source_issue_key.
-- Downstream consumers: weather operations, future dashboard/API read paths.

CREATE TABLE IF NOT EXISTS weather.wsi_daily_weighted_degree_day_forecasts (
    source_issue_key VARCHAR NOT NULL,
    source_issue_at_utc TIMESTAMPTZ,
    source_banner VARCHAR,
    scrape_run_at_utc TIMESTAMPTZ NOT NULL,
    source_product_id VARCHAR NOT NULL DEFAULT 'WEIGHTED_DEGREE_DAY_FORECAST',
    request_region VARCHAR NOT NULL,
    entity_id VARCHAR NOT NULL,
    model VARCHAR NOT NULL,
    forecast_type VARCHAR NOT NULL,
    bias_corrected BOOLEAN NOT NULL,
    forecast_period VARCHAR NOT NULL,
    forecast_date DATE NOT NULL,
    period_end_date DATE NOT NULL,
    metric_name VARCHAR NOT NULL,
    metric_value DOUBLE PRECISION,
    metric_unit VARCHAR,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (
        source_issue_key,
        model,
        forecast_type,
        request_region,
        entity_id,
        forecast_date,
        metric_name
    )
);
