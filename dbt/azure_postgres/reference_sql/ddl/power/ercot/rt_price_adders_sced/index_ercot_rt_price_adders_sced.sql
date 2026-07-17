-- Source-table indexes for ercot.rt_price_adders_sced.
--
-- This file is disabled as a dbt model in dbt_project.yml. It is retained as
-- operator reference SQL only. Read-only dbt credentials cannot run this.

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ercot_rt_price_adders_sced_updated_at
    ON ercot.rt_price_adders_sced (updated_at DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ercot_rt_price_adders_sced_timestamp
    ON ercot.rt_price_adders_sced (scedtimestamp DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ercot_rt_price_adders_sced_energy
    ON ercot.rt_price_adders_sced (scedtimestamp DESC, rtrdpa);
