-- Source-table DDL for ice_trade_blotter.ice_trade_blotter.
--
-- This file is reference/operator SQL only. It is outside dbt model-paths and
-- should not be run by dbt. Read-only dbt credentials cannot run this.
-- Apply it manually with the helios_admin role before running
-- backend.scrapes.ice_trade_blotters or backend.orchestration.ice_trade_blotters.
--
-- Source system: manually downloaded ICE Deal Report .xls/CSV exports.
-- Grain: one raw ICE deal-leg row from one managed source file.
-- Uniqueness key: deal_id x trade_date x user_id x leg_id x b_s x hub x
-- contract x begin_date x end_date x lots x total_quantity x price x option x
-- strike x strike_2. Historical ICE exports can leave string key fields blank;
-- the business key is enforced by a UNIQUE NULLS NOT DISTINCT index in
-- index_ice_trade_blotter.sql instead of a PRIMARY KEY.
-- Safe rerun: backend upserts by the uniqueness key. File lineage is retained
-- through file_hash, source_row_number, source_row_hash, and file_manifest.
-- Downstream consumers: read-only inspection SQL for ICE vs NAV positions and
-- ICE vs Clear Street trade review.

CREATE TABLE IF NOT EXISTS ice_trade_blotter.ice_trade_blotter (
    trade_date DATE NOT NULL,
    trade_time VARCHAR,
    deal_id VARCHAR,
    leg_id VARCHAR,
    orig_id VARCHAR,
    b_s VARCHAR,
    product VARCHAR,
    hub VARCHAR,
    contract VARCHAR,
    begin_date VARCHAR,
    end_date VARCHAR,
    clearing_acct VARCHAR,
    cust_acct VARCHAR,
    clearing_firm VARCHAR,
    price DOUBLE PRECISION NOT NULL,
    price_units VARCHAR,
    option VARCHAR,
    strike DOUBLE PRECISION NOT NULL,
    strike_2 DOUBLE PRECISION NOT NULL,
    style VARCHAR,
    lots INTEGER NOT NULL,
    total_quantity DOUBLE PRECISION NOT NULL,
    qty_units VARCHAR,
    tt VARCHAR,
    brk VARCHAR,
    trader VARCHAR,
    memo TEXT,
    clearing_venue VARCHAR,
    user_id VARCHAR,
    source VARCHAR,
    link_id VARCHAR,
    usi VARCHAR,
    authorized_trader_id VARCHAR,
    location VARCHAR,
    meter VARCHAR,
    lead_time VARCHAR,
    waiver_ind VARCHAR,
    trade_time_micros VARCHAR,
    cdi_override VARCHAR,
    by_pass_mqr VARCHAR,
    broker_name VARCHAR,
    trading_company VARCHAR,
    mic VARCHAR,
    cc VARCHAR,
    strip VARCHAR,
    counterparty VARCHAR,
    qty_per_period DOUBLE PRECISION,
    periods INTEGER,
    counterparty_user VARCHAR,
    report_date DATE NOT NULL,
    deal_section VARCHAR,
    file_hash VARCHAR NOT NULL,
    source_row_number INTEGER NOT NULL,
    source_row_hash VARCHAR NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE ice_trade_blotter.ice_trade_blotter IS
    'Raw ICE Deal Report rows loaded from managed local .xls/CSV trade blotter exports.';
