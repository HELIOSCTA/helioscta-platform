-- Source-table DDL for eia.nat_gas_consumption_end_use_monthly.
--
-- This file is disabled as a dbt model in dbt_project.yml. It is retained as
-- operator reference SQL only. Read-only dbt credentials cannot run this.
-- Apply it manually with the helios_admin role before running
-- backend.orchestration.eia.nat_gas_consumption_end_use_monthly.

CREATE SCHEMA IF NOT EXISTS eia;

CREATE TABLE IF NOT EXISTS eia.nat_gas_consumption_end_use_monthly (
    report_month DATE NOT NULL,
    duoarea VARCHAR,
    area_name VARCHAR,
    product VARCHAR,
    product_name VARCHAR,
    process VARCHAR,
    process_name VARCHAR,
    series VARCHAR NOT NULL,
    series_description VARCHAR,
    value_mmcf DOUBLE PRECISION,
    units VARCHAR,
    source_frequency VARCHAR,
    source_period VARCHAR,
    scrape_run_at_utc TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (
        report_month,
        series
    )
);
