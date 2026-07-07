-- Source-table DDL for nav.positions.
--
-- This file is disabled as a dbt model in dbt_project.yml. It is retained as
-- operator reference SQL only. Read-only dbt credentials cannot run this.
-- Apply it manually with the helios_admin role before running
-- backend.orchestration.nav.positions.
--
-- Source system: NAV SFTP Position Valuation Detail Report XLSX files.
-- Grain: fund_code x nav_date x sftp_upload_timestamp x source_file_name x
-- source_file_row_number.
-- This is a raw source table. Product-code, product-group, contract, and
-- normalization-status fields are derived in read-only SQL, not persisted here.

CREATE TABLE IF NOT EXISTS nav.positions (
    fund_code VARCHAR NOT NULL,
    source_legal_entity VARCHAR NOT NULL,
    source_file_name VARCHAR NOT NULL,
    source_file_row_number INTEGER NOT NULL,
    nav_date DATE NOT NULL,
    sftp_upload_timestamp TIMESTAMPTZ NOT NULL,
    broker_name VARCHAR,
    account_group VARCHAR,
    account VARCHAR,
    trade_date DATE,
    product_id_internal VARCHAR,
    product VARCHAR,
    type VARCHAR,
    month_year VARCHAR,
    client_symbol VARCHAR,
    strike_price DOUBLE PRECISION,
    call_put VARCHAR,
    product_currency_1 VARCHAR,
    long_short VARCHAR,
    quantity_1 DOUBLE PRECISION,
    counter_currency_ccy2 VARCHAR,
    ccy2_long_short VARCHAR,
    ccy2_quantity_2 DOUBLE PRECISION,
    trade_price DOUBLE PRECISION,
    multiplier_and_tick_value DOUBLE PRECISION,
    cost_in_native_currency DOUBLE PRECISION,
    open_exchange_rate DOUBLE PRECISION,
    cost_in_base_currency DOUBLE PRECISION,
    market_settlement_price DOUBLE PRECISION,
    market_value_in_native_currency DOUBLE PRECISION,
    close_exchange_rate DOUBLE PRECISION,
    market_value_in_base_currency DOUBLE PRECISION,
    sector VARCHAR,
    sub_sector VARCHAR,
    country VARCHAR,
    exchange_name VARCHAR,
    source_1_symbol VARCHAR,
    source_3_symbol VARCHAR,
    one_chicago_symbol VARCHAR,
    fas_level VARCHAR,
    option_style VARCHAR,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (
        fund_code,
        nav_date,
        sftp_upload_timestamp,
        source_file_name,
        source_file_row_number
    )
);

-- Existing tables from the first NAV v1 pass may still carry rule-derived
-- columns. Drop them so nav.positions remains raw-only and rule changes do not
-- require source-table backfills.
ALTER TABLE nav.positions
    DROP COLUMN IF EXISTS product_code,
    DROP COLUMN IF EXISTS product_group,
    DROP COLUMN IF EXISTS product_region,
    DROP COLUMN IF EXISTS underlying_product_code,
    DROP COLUMN IF EXISTS contract_yyyymm,
    DROP COLUMN IF EXISTS contract_day,
    DROP COLUMN IF EXISTS put_call,
    DROP COLUMN IF EXISTS normalized_strike_price,
    DROP COLUMN IF EXISTS instrument_type,
    DROP COLUMN IF EXISTS normalization_status;
