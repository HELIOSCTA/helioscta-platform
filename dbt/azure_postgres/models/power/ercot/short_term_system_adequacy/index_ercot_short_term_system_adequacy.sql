-- Source-table indexes for ercot.short_term_system_adequacy.
--
-- This file is disabled as a dbt model in dbt_project.yml. It is retained as
-- operator reference SQL only. Read-only dbt credentials cannot run this.

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ercot_stsa_updated_at
    ON ercot.short_term_system_adequacy (updated_at DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ercot_stsa_delivery
    ON ercot.short_term_system_adequacy (deliverydate DESC, hourending);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ercot_stsa_posted
    ON ercot.short_term_system_adequacy (posteddatetime DESC);
