-- Source-table indexes for ercot.rt_price_adders_15min.
--
-- This file is disabled as a dbt model in dbt_project.yml. It is retained as
-- operator reference SQL only. Read-only dbt credentials cannot run this.

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ercot_rt_price_adders_15min_updated_at
    ON ercot.rt_price_adders_15min (updated_at DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ercot_rt_price_adders_15min_delivery
    ON ercot.rt_price_adders_15min (
        deliverydate DESC,
        deliveryhour,
        deliveryinterval
    );

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ercot_rt_price_adders_15min_energy
    ON ercot.rt_price_adders_15min (deliverydate DESC, rtrdpa);
