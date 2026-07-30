-- Source-table DDL for eia.eia_930_daily_generation_by_fuel.
--
-- This file is disabled as a dbt model in dbt_project.yml. It is retained as
-- operator reference SQL only. Read-only dbt credentials cannot run this.
-- Apply it manually with the helios_admin role before running
-- backend.orchestration.eia.eia_930_daily_generation_by_fuel.
--
-- Source system: EIA Open Data API v2, Hourly Electric Grid Monitor
-- Endpoint: /electricity/rto/daily-fuel-type-data
-- Primary grain: period x respondent x fueltype x timezone
-- Safe rerun: upsert raw API rows by the primary grain

CREATE SCHEMA IF NOT EXISTS eia;

CREATE TABLE IF NOT EXISTS eia.eia_930_daily_generation_by_fuel (
    period DATE NOT NULL,
    respondent VARCHAR NOT NULL,
    respondent_name VARCHAR,
    fueltype VARCHAR NOT NULL,
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
        fueltype,
        timezone
    )
);
