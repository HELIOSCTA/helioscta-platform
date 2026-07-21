-- Source-table DDL for weather.wsi_daily_weighted_degree_day_observations.
--
-- This file is disabled as a dbt model in dbt_project.yml. It is retained as
-- operator reference SQL only. Read-only dbt credentials cannot run this.
-- Apply it manually with the helios_admin role before scheduling
-- backend.orchestration.weather.wsi.daily_weighted_observations.
--
-- Source system: WSI Trader GetHistoricalObservations.
-- Source product: HISTORICAL_WEIGHTED_DEGREEDAYS.
-- Grain:
--   source_product_id x request_region x entity_id x observation_date
--   x metric_name.
-- Safe rerun key: primary key below.
-- Freshness field: observation_date.
-- Downstream consumers: weather operations, future dashboard/API read paths.

CREATE TABLE IF NOT EXISTS weather.wsi_daily_weighted_degree_day_observations (
    source_product_id VARCHAR NOT NULL DEFAULT 'HISTORICAL_WEIGHTED_DEGREEDAYS',
    source_banner VARCHAR,
    scrape_run_at_utc TIMESTAMPTZ NOT NULL,
    request_start_date DATE NOT NULL,
    request_end_date DATE NOT NULL,
    request_region VARCHAR NOT NULL,
    entity_id VARCHAR NOT NULL,
    temp_units VARCHAR NOT NULL,
    is_daily BOOLEAN NOT NULL,
    is_temp BOOLEAN NOT NULL,
    is_display_dates BOOLEAN NOT NULL,
    observation_date DATE NOT NULL,
    metric_name VARCHAR NOT NULL,
    metric_value DOUBLE PRECISION,
    metric_unit VARCHAR,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (
        source_product_id,
        request_region,
        entity_id,
        observation_date,
        metric_name
    )
);
