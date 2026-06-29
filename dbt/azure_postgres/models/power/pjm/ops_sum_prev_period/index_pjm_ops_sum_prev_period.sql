-- Source-table indexes for pjm.ops_sum_prev_period.
--
-- This file is disabled as a dbt model in dbt_project.yml. It is retained as
-- operator reference SQL only. Read-only dbt credentials cannot run this.
-- If an operator applies it, use a write-capable role in a SQL editor with
-- autocommit enabled. Do not wrap CREATE INDEX CONCURRENTLY in BEGIN/COMMIT.

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ops_sum_prev_period_freshness
    ON pjm.ops_sum_prev_period (
        datetime_beginning_ept,
        generated_at_ept
    )
    INCLUDE (
        area,
        actual_load,
        area_load_forecast,
        dispatch_rate
    );

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ops_sum_prev_period_pk_lookup
    ON pjm.ops_sum_prev_period (
        datetime_beginning_utc,
        generated_at_ept,
        area
    );
