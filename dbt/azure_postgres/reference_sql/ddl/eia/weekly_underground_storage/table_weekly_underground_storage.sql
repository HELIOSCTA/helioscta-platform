-- Source-table DDL for eia.weekly_underground_storage.
--
-- This file is disabled as a dbt model in dbt_project.yml. It is retained as
-- operator reference SQL only. Read-only dbt credentials cannot run this.
-- Apply it manually with the helios_admin role before running
-- backend.orchestration.eia.weekly_underground_storage.

CREATE SCHEMA IF NOT EXISTS eia;

CREATE TABLE IF NOT EXISTS eia.weekly_underground_storage (
    eia_week_ending DATE NOT NULL,
    duoarea VARCHAR,
    area_name VARCHAR,
    region VARCHAR,
    product VARCHAR,
    product_name VARCHAR,
    process VARCHAR,
    process_name VARCHAR,
    series VARCHAR NOT NULL,
    series_description VARCHAR,
    value_bcf DOUBLE PRECISION,
    units VARCHAR,
    source_frequency VARCHAR,
    source_period VARCHAR,
    scrape_run_at_utc TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (
        eia_week_ending,
        series
    )
);
