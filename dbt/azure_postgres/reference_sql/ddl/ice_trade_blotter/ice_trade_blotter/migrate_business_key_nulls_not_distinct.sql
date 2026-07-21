-- One-time migration for ICE trade blotter tables created with a PRIMARY KEY
-- on the business key.
--
-- Historical ICE exports can leave string business-key fields blank. The
-- backend COPY path represents those blanks as NULL, so the table cannot use a
-- PRIMARY KEY on the raw business key. PostgreSQL 16 supports UNIQUE NULLS NOT
-- DISTINCT, which keeps rerunnable upserts deterministic while allowing raw
-- blank values to remain NULL.
--
-- Apply with helios_admin. CREATE INDEX CONCURRENTLY requires autocommit; do
-- not wrap this file in BEGIN/COMMIT.

ALTER TABLE ice_trade_blotter.ice_trade_blotter
    DROP CONSTRAINT IF EXISTS ice_trade_blotter_pkey;

ALTER TABLE ice_trade_blotter.ice_trade_blotter
    ALTER COLUMN deal_id DROP NOT NULL,
    ALTER COLUMN user_id DROP NOT NULL,
    ALTER COLUMN leg_id DROP NOT NULL,
    ALTER COLUMN b_s DROP NOT NULL,
    ALTER COLUMN hub DROP NOT NULL,
    ALTER COLUMN contract DROP NOT NULL,
    ALTER COLUMN begin_date DROP NOT NULL,
    ALTER COLUMN end_date DROP NOT NULL,
    ALTER COLUMN option DROP NOT NULL;

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
