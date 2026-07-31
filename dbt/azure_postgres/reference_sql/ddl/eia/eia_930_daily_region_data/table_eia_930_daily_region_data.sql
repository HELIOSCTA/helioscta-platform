-- Source-table DDL for eia.eia_930_daily_region_data.
--
-- This file is disabled as a dbt model in dbt_project.yml. It is retained as
-- operator reference SQL only. Read-only dbt credentials cannot run this.
-- Apply it manually with the helios_admin role before running
-- backend.orchestration.eia.eia_930_daily_region_data.
--
-- Source system: EIA Open Data API v2, Hourly Electric Grid Monitor
-- Endpoint: /electricity/rto/daily-region-data
-- Primary grain: period x respondent x type x timezone
-- Safe rerun: upsert raw API rows by the primary grain
-- Type values:
--   D = demand
--   DF = day-ahead demand forecast
--   NG = net generation
--   TI = total interchange

CREATE SCHEMA IF NOT EXISTS eia;

CREATE TABLE IF NOT EXISTS eia.eia_930_daily_region_data (
    period DATE NOT NULL,
    respondent VARCHAR NOT NULL,
    respondent_name VARCHAR,
    type VARCHAR NOT NULL,
    type_name VARCHAR,
    timezone VARCHAR NOT NULL,
    timezone_description VARCHAR,
    value DOUBLE PRECISION,
    value_units VARCHAR,
    scrape_run_at_utc TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (
        period,
        respondent,
        type,
        timezone
    )
);
