-- Source-table DDL for bbg_dapi.bbg_tickers.
--
-- Source system: Bloomberg Desktop API ticker universe maintained in
-- backend.scrapes.bloomberg_dapi.symbols, optionally enriched by BLPAPI
-- ReferenceDataRequest fields from //blp/refdata.
-- Grain: one row per Bloomberg security.
-- Uniqueness key: security.
-- Freshness fields: bloomberg_reference_fetched_at_utc records the latest
-- successful Bloomberg reference metadata pull, and updated_at records the
-- latest successful table upsert.
-- Safe rerun story: backend.orchestration.bloomberg_dapi.tickers upserts by
-- security and overwrites the repo-owned metadata plus nullable Bloomberg
-- reference metadata fields for the fixed symbol list.
--
-- This file is disabled as a dbt model in dbt_project.yml. It is retained as
-- operator reference SQL only. Read-only dbt credentials cannot run this.
-- Apply it manually with the helios_admin role before enabling local Windows
-- Bloomberg DAPI scheduled jobs.

CREATE SCHEMA IF NOT EXISTS bbg_dapi;

CREATE TABLE IF NOT EXISTS bbg_dapi.bbg_tickers (
    security VARCHAR NOT NULL,
    description VARCHAR,
    category VARCHAR,
    subcategory VARCHAR,
    region VARCHAR,
    market VARCHAR,
    commodity VARCHAR,
    unit VARCHAR,
    frequency VARCHAR,
    default_data_type VARCHAR,
    metadata_source VARCHAR,
    metadata_notes TEXT,
    bloomberg_name VARCHAR,
    bloomberg_security_description VARCHAR,
    bloomberg_currency VARCHAR,
    bloomberg_country VARCHAR,
    bloomberg_market_sector VARCHAR,
    bloomberg_reference_fetched_at_utc TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (security)
);

ALTER TABLE bbg_dapi.bbg_tickers
    ADD COLUMN IF NOT EXISTS category VARCHAR,
    ADD COLUMN IF NOT EXISTS subcategory VARCHAR,
    ADD COLUMN IF NOT EXISTS region VARCHAR,
    ADD COLUMN IF NOT EXISTS market VARCHAR,
    ADD COLUMN IF NOT EXISTS commodity VARCHAR,
    ADD COLUMN IF NOT EXISTS unit VARCHAR,
    ADD COLUMN IF NOT EXISTS frequency VARCHAR,
    ADD COLUMN IF NOT EXISTS default_data_type VARCHAR,
    ADD COLUMN IF NOT EXISTS metadata_source VARCHAR,
    ADD COLUMN IF NOT EXISTS metadata_notes TEXT,
    ADD COLUMN IF NOT EXISTS bloomberg_name VARCHAR,
    ADD COLUMN IF NOT EXISTS bloomberg_security_description VARCHAR,
    ADD COLUMN IF NOT EXISTS bloomberg_currency VARCHAR,
    ADD COLUMN IF NOT EXISTS bloomberg_country VARCHAR,
    ADD COLUMN IF NOT EXISTS bloomberg_market_sector VARCHAR,
    ADD COLUMN IF NOT EXISTS bloomberg_reference_fetched_at_utc TIMESTAMPTZ;

COMMENT ON TABLE bbg_dapi.bbg_tickers IS
    'Fixed Bloomberg DAPI ticker universe used by HeliosCTA gas/energy workflows.';
COMMENT ON COLUMN bbg_dapi.bbg_tickers.security IS
    'Bloomberg security identifier, for example GSPRODUS Index.';
COMMENT ON COLUMN bbg_dapi.bbg_tickers.description IS
    'Operator-facing HeliosCTA description/category from the promoted symbol list.';
COMMENT ON COLUMN bbg_dapi.bbg_tickers.category IS
    'HeliosCTA business category, such as supply, demand, weather, storage, cross_border_flow, or spot_price.';
COMMENT ON COLUMN bbg_dapi.bbg_tickers.subcategory IS
    'HeliosCTA business subcategory, such as production, lng_feedgas, canada_import, mexico_export, or cash_price.';
COMMENT ON COLUMN bbg_dapi.bbg_tickers.region IS
    'HeliosCTA region, basin, route, terminal, or hub label used for downstream grouping.';
COMMENT ON COLUMN bbg_dapi.bbg_tickers.market IS
    'HeliosCTA market family, such as gas_balances, lng, gas_weather, power_weather, or natural_gas_cash.';
COMMENT ON COLUMN bbg_dapi.bbg_tickers.commodity IS
    'Commodity or domain represented by the security, for example natural_gas or weather.';
COMMENT ON COLUMN bbg_dapi.bbg_tickers.unit IS
    'Expected value unit from the metadata registry when known; nullable when unit-sensitive use requires Bloomberg validation.';
COMMENT ON COLUMN bbg_dapi.bbg_tickers.frequency IS
    'Expected observation frequency for the promoted historical pull.';
COMMENT ON COLUMN bbg_dapi.bbg_tickers.default_data_type IS
    'Bloomberg field mnemonic pulled by default for historical values, initially PX_LAST.';
COMMENT ON COLUMN bbg_dapi.bbg_tickers.metadata_source IS
    'Source of the repo-owned metadata values.';
COMMENT ON COLUMN bbg_dapi.bbg_tickers.metadata_notes IS
    'Operator notes for symbols whose market label or unit should be validated with Bloomberg reference metadata.';
COMMENT ON COLUMN bbg_dapi.bbg_tickers.bloomberg_name IS
    'Bloomberg NAME field from the latest optional ReferenceDataRequest metadata enrichment.';
COMMENT ON COLUMN bbg_dapi.bbg_tickers.bloomberg_security_description IS
    'Bloomberg SECURITY_DES field from the latest optional ReferenceDataRequest metadata enrichment.';
COMMENT ON COLUMN bbg_dapi.bbg_tickers.bloomberg_currency IS
    'Bloomberg CRNCY field from the latest optional ReferenceDataRequest metadata enrichment.';
COMMENT ON COLUMN bbg_dapi.bbg_tickers.bloomberg_country IS
    'Bloomberg COUNTRY field from the latest optional ReferenceDataRequest metadata enrichment.';
COMMENT ON COLUMN bbg_dapi.bbg_tickers.bloomberg_market_sector IS
    'Bloomberg MARKET_SECTOR_DES field from the latest optional ReferenceDataRequest metadata enrichment.';
COMMENT ON COLUMN bbg_dapi.bbg_tickers.bloomberg_reference_fetched_at_utc IS
    'UTC timestamp when Bloomberg reference metadata fields were last fetched for this ticker.';
