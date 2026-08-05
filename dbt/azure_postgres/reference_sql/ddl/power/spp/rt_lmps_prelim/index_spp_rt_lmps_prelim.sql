-- Source-table indexes for spp.rt_lmps_prelim.
--
-- This file is disabled as a dbt model in dbt_project.yml. It is retained as
-- operator reference SQL only. If an operator applies it, use a write-capable
-- role with autocommit enabled. Do not wrap CREATE INDEX CONCURRENTLY in
-- BEGIN/COMMIT.

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_spp_rt_lmps_prelim_updated_at
    ON spp.rt_lmps_prelim (updated_at DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_spp_rt_lmps_prelim_operating_date_node
    ON spp.rt_lmps_prelim (
        operating_date DESC,
        node_id,
        operating_hour,
        operating_interval
    )
    INCLUDE (
        locational_marginal_price,
        energy_component,
        congestion_component,
        loss_component
    );

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_spp_rt_lmps_prelim_interval_node
    ON spp.rt_lmps_prelim (
        interval_start_time_utc DESC,
        node_id
    )
    INCLUDE (
        operating_date,
        operating_hour,
        operating_interval,
        locational_marginal_price
    );

