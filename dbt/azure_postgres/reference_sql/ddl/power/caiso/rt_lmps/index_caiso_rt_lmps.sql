-- Source-table indexes for caiso.rt_lmps.
--
-- This file is disabled as a dbt model in dbt_project.yml. It is retained as
-- operator reference SQL only. Read-only dbt credentials cannot run this.
-- If an operator applies it, use a write-capable role in a SQL editor with
-- autocommit enabled. Do not wrap CREATE INDEX CONCURRENTLY in BEGIN/COMMIT.

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_caiso_rt_lmps_updated_at
    ON caiso.rt_lmps (updated_at DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_caiso_rt_lmps_operating_date_node
    ON caiso.rt_lmps (
        operating_date DESC,
        node_id,
        operating_hour,
        operating_interval
    )
    INCLUDE (
        locational_marginal_price,
        energy_component,
        congestion_component,
        loss_component,
        greenhouse_gas_component
    );

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_caiso_rt_lmps_interval_node
    ON caiso.rt_lmps (
        interval_start_time_utc DESC,
        node_id
    )
    INCLUDE (
        operating_date,
        operating_hour,
        operating_interval,
        locational_marginal_price
    );
