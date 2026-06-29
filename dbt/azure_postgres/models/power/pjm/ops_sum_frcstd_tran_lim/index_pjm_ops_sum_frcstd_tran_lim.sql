-- Source-table indexes for pjm.ops_sum_frcstd_tran_lim.
--
-- This file is disabled as a dbt model in dbt_project.yml. It is retained as
-- operator reference SQL only. Read-only dbt credentials cannot run this.
-- If an operator applies it, use a write-capable role in a SQL editor with
-- autocommit enabled. Do not wrap CREATE INDEX CONCURRENTLY in BEGIN/COMMIT.

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ops_sum_frcstd_tran_lim_freshness
    ON pjm.ops_sum_frcstd_tran_lim (
        projected_peak_datetime_ept,
        generated_at_ept
    )
    INCLUDE (
        transfer_limit_name,
        transfer_limit_mw
    );

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ops_sum_frcstd_tran_lim_pk_lookup
    ON pjm.ops_sum_frcstd_tran_lim (
        projected_peak_datetime_utc,
        transfer_limit_name
    );
