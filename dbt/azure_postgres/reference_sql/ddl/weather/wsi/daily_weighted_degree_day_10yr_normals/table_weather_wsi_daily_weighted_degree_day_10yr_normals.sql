-- Derived-table DDL for weather.wsi_daily_weighted_degree_day_10yr_normals.
--
-- This file is disabled as a dbt model in dbt_project.yml. It is retained as
-- operator reference SQL only. Read-only dbt credentials cannot run this.
-- Apply it manually with the helios_admin role before running
-- backend.orchestration.weather.wsi.daily_weighted_degree_day_10yr_normals.
--
-- Source system: WSI Trader GetHistoricalObservations.
-- Source table: weather.wsi_daily_weighted_degree_day_observations.
-- Source product: HISTORICAL_WEIGHTED_DEGREEDAYS.
-- Source grain:
--   source_product_id x request_region x entity_id x observation_date
--   x metric_name.
-- Derived grain:
--   normal_window_end_year x lookback_years x request_region x entity_id
--   x metric_name x calendar_month x calendar_day.
-- Calculation:
--   Average observed metric_value over the last complete lookback_years
--   calendar years ending with normal_window_end_year, grouped by month/day.
--   February 29 is intentionally excluded.
-- Safe rerun key: primary key below.
-- Freshness fields: normal_window_end_year, computed_at_utc, updated_at.
-- Downstream consumers: WSI Weather forecast-change API/dashboard normals.

CREATE TABLE IF NOT EXISTS weather.wsi_daily_weighted_degree_day_10yr_normals (
    normal_window_end_year INTEGER NOT NULL,
    lookback_years INTEGER NOT NULL DEFAULT 10,
    source_product_id VARCHAR NOT NULL DEFAULT 'HISTORICAL_WEIGHTED_DEGREEDAYS',
    request_region VARCHAR NOT NULL,
    entity_id VARCHAR NOT NULL,
    metric_name VARCHAR NOT NULL,
    calendar_month SMALLINT NOT NULL,
    calendar_day SMALLINT NOT NULL,
    normal_value DOUBLE PRECISION NOT NULL,
    metric_unit VARCHAR,
    sample_start_date DATE NOT NULL,
    sample_end_date DATE NOT NULL,
    sample_year_count INTEGER NOT NULL,
    sample_day_count INTEGER NOT NULL,
    source_observation_max_date DATE,
    computed_at_utc TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT wsi_daily_weighted_degree_day_10yr_normals_day_check
        CHECK (
            calendar_month BETWEEN 1 AND 12
            AND calendar_day BETWEEN 1 AND 31
            AND NOT (calendar_month = 2 AND calendar_day = 29)
        ),
    CONSTRAINT wsi_daily_weighted_degree_day_10yr_normals_window_check
        CHECK (lookback_years > 0 AND sample_year_count BETWEEN 1 AND lookback_years),
    CONSTRAINT wsi_daily_weighted_degree_day_10yr_normals_sample_check
        CHECK (sample_day_count >= sample_year_count),
    PRIMARY KEY (
        normal_window_end_year,
        lookback_years,
        request_region,
        entity_id,
        metric_name,
        calendar_month,
        calendar_day
    )
);
