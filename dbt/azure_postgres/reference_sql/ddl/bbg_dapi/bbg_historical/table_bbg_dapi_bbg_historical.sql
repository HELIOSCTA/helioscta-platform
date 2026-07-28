-- Source-table DDL for bbg_dapi.bbg_historical.
--
-- Source system: Bloomberg Desktop API / DAPI through BLPAPI //blp/refdata
-- HistoricalDataRequest on a licensed Windows host running Bloomberg Terminal.
-- Grain: one row per security, historical date, and Bloomberg data type.
-- Uniqueness key: security, date, data_type.
-- Freshness fields: source_fetched_at_utc records the DAPI fetch timestamp for
-- the source values; updated_at records the database write timestamp.
-- Safe rerun story: backend.orchestration.bloomberg_dapi.historical upserts by
-- security, date, data_type so rolling windows refresh prior values.
--
-- This file is disabled as a dbt model in dbt_project.yml. It is retained as
-- operator reference SQL only. Read-only dbt credentials cannot run this.
-- Apply it manually with the helios_admin role before enabling local Windows
-- Bloomberg DAPI scheduled jobs.

CREATE SCHEMA IF NOT EXISTS bbg_dapi;

CREATE TABLE IF NOT EXISTS bbg_dapi.bbg_historical (
    security VARCHAR NOT NULL,
    date DATE NOT NULL,
    data_type VARCHAR NOT NULL,
    value DOUBLE PRECISION,
    source_fetched_at_utc TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (security, date, data_type)
);

COMMENT ON TABLE bbg_dapi.bbg_historical IS
    'Long-form Bloomberg DAPI historical values from //blp/refdata HistoricalDataRequest.';
COMMENT ON COLUMN bbg_dapi.bbg_historical.security IS
    'Bloomberg security identifier, for example GSPRODUS Index.';
COMMENT ON COLUMN bbg_dapi.bbg_historical.date IS
    'Bloomberg historical observation date.';
COMMENT ON COLUMN bbg_dapi.bbg_historical.data_type IS
    'Bloomberg field mnemonic, default PX_LAST.';
COMMENT ON COLUMN bbg_dapi.bbg_historical.value IS
    'Numeric field value returned by Bloomberg for the security/date/data_type.';
COMMENT ON COLUMN bbg_dapi.bbg_historical.source_fetched_at_utc IS
    'UTC timestamp when the DAPI request result was fetched by the scheduler host.';
