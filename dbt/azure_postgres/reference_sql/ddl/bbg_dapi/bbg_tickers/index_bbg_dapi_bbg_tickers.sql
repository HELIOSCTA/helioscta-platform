-- Source-table indexes for bbg_dapi.bbg_tickers.
--
-- This file is disabled as a dbt model in dbt_project.yml. It is retained as
-- operator reference SQL only. If an operator applies it, use helios_admin in a
-- SQL editor with autocommit enabled.

CREATE INDEX IF NOT EXISTS idx_bbg_dapi_bbg_tickers_updated_at
    ON bbg_dapi.bbg_tickers (updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_bbg_dapi_bbg_tickers_category
    ON bbg_dapi.bbg_tickers (category, subcategory);

CREATE INDEX IF NOT EXISTS idx_bbg_dapi_bbg_tickers_market
    ON bbg_dapi.bbg_tickers (market, region);
