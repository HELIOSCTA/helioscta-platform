-- Source-table indexes for ercot.sced_shadow_prices.
--
-- This file is disabled as a dbt model in dbt_project.yml. It is retained as
-- operator reference SQL only. Read-only dbt credentials cannot run this.

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ercot_sced_shadow_prices_updated_at
    ON ercot.sced_shadow_prices (updated_at DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ercot_sced_shadow_prices_timestamp
    ON ercot.sced_shadow_prices (scedtimestamp DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ercot_sced_shadow_prices_shadow
    ON ercot.sced_shadow_prices (scedtimestamp DESC, shadowprice);
