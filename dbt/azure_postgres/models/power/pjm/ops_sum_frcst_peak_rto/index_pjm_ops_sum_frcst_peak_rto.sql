-- Source-table indexes for pjm.ops_sum_frcst_peak_rto.
--
-- This file is disabled as a dbt model in dbt_project.yml. It is retained as
-- operator reference SQL only. Read-only dbt credentials cannot run this.
-- If an operator applies it, use a write-capable role in a SQL editor with
-- autocommit enabled. Do not wrap CREATE INDEX CONCURRENTLY in BEGIN/COMMIT.

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ops_sum_frcst_peak_rto_freshness
    ON pjm.ops_sum_frcst_peak_rto (
        projected_peak_datetime_ept,
        generated_at_ept
    )
    INCLUDE (
        load_forecast,
        operating_reserve,
        total_scheduled_capacity
    );

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ops_sum_frcst_peak_rto_pk_lookup
    ON pjm.ops_sum_frcst_peak_rto (
        projected_peak_datetime_utc,
        generated_at_ept,
        area
    );
