-- Source-table indexes for nyiso.da_lmps.
--
-- This file is disabled as a dbt model in dbt_project.yml. It is retained as
-- operator reference SQL only. If an operator applies it, use a write-capable
-- role with autocommit enabled. Do not wrap CREATE INDEX CONCURRENTLY in
-- BEGIN/COMMIT.

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_nyiso_da_lmps_updated_at
    ON nyiso.da_lmps (updated_at DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_nyiso_da_lmps_operating_date_node
    ON nyiso.da_lmps (
        operating_date DESC,
        node_id,
        operating_hour
    )
    INCLUDE (
        ptid,
        locational_marginal_price,
        energy_component,
        congestion_component,
        loss_component
    );

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_nyiso_da_lmps_interval_node
    ON nyiso.da_lmps (
        interval_start_time_utc DESC,
        node_id
    )
    INCLUDE (
        operating_date,
        operating_hour,
        ptid,
        price_status,
        locational_marginal_price
    );
