-- Source-table indexes for bbg_dapi.bbg_historical.
--
-- This file is disabled as a dbt model in dbt_project.yml. It is retained as
-- operator reference SQL only. If an operator applies it, use helios_admin in a
-- SQL editor with autocommit enabled.

CREATE INDEX IF NOT EXISTS idx_bbg_dapi_bbg_historical_date_security
    ON bbg_dapi.bbg_historical (date DESC, security, data_type);

CREATE INDEX IF NOT EXISTS idx_bbg_dapi_bbg_historical_freshness
    ON bbg_dapi.bbg_historical (source_fetched_at_utc DESC);
