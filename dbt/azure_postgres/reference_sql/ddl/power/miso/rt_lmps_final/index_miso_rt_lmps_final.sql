-- Source-table indexes for miso.rt_lmps_final.
--
-- This file is disabled as a dbt model in dbt_project.yml. It is retained as
-- operator reference SQL only. If an operator applies it, use a write-capable
-- role with autocommit enabled. Do not wrap CREATE INDEX CONCURRENTLY in
-- BEGIN/COMMIT.

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_miso_rt_lmps_final_updated_at
    ON miso.rt_lmps_final (updated_at DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_miso_rt_lmps_final_operating_date_node
    ON miso.rt_lmps_final (
        operating_date DESC,
        node_id,
        operating_hour
    )
    INCLUDE (
        locational_marginal_price,
        energy_component,
        congestion_component,
        loss_component
    );

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_miso_rt_lmps_final_interval_node
    ON miso.rt_lmps_final (
        interval_start_time_utc DESC,
        node_id
    )
    INCLUDE (
        operating_date,
        operating_hour,
        price_status,
        locational_marginal_price
    );
