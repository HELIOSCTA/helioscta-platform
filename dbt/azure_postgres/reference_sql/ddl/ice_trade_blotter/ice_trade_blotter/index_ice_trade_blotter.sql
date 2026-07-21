-- Source-table indexes for ice_trade_blotter.ice_trade_blotter.
--
-- This file is reference/operator SQL only. It is outside dbt model-paths and
-- should not be run by dbt. If an operator applies it, use a write-capable
-- role in a SQL editor with autocommit enabled. Do not wrap CREATE INDEX
-- CONCURRENTLY in BEGIN/COMMIT.

CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS idx_ice_trade_blotter_business_key
    ON ice_trade_blotter.ice_trade_blotter (
        deal_id,
        trade_date,
        user_id,
        leg_id,
        b_s,
        hub,
        contract,
        begin_date,
        end_date,
        lots,
        total_quantity,
        price,
        option,
        strike,
        strike_2
    )
    NULLS NOT DISTINCT;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ice_trade_blotter_updated_at
    ON ice_trade_blotter.ice_trade_blotter (updated_at DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ice_trade_blotter_file_hash
    ON ice_trade_blotter.ice_trade_blotter (file_hash);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ice_trade_blotter_report_date
    ON ice_trade_blotter.ice_trade_blotter (report_date DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ice_trade_blotter_trade_date
    ON ice_trade_blotter.ice_trade_blotter (trade_date DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ice_trade_blotter_product_contract
    ON ice_trade_blotter.ice_trade_blotter (
        trade_date DESC,
        product,
        hub,
        contract
    );

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ice_trade_blotter_deal_leg
    ON ice_trade_blotter.ice_trade_blotter (deal_id, leg_id);
