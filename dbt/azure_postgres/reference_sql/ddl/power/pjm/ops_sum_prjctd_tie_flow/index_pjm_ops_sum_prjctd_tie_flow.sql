-- Source-table indexes for pjm.ops_sum_prjctd_tie_flow.
--
-- This file is disabled as a dbt model in dbt_project.yml. It is retained as
-- operator reference SQL only. Read-only dbt credentials cannot run this.
-- If an operator applies it, use a write-capable role in a SQL editor with
-- autocommit enabled. Do not wrap CREATE INDEX CONCURRENTLY in BEGIN/COMMIT.

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ops_sum_prjctd_tie_flow_freshness
    ON pjm.ops_sum_prjctd_tie_flow (
        projected_peak_datetime_ept,
        generated_at_ept
    )
    INCLUDE (
        interface,
        scheduled_tie_flow
    );

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ops_sum_prjctd_tie_flow_pk_lookup
    ON pjm.ops_sum_prjctd_tie_flow (
        projected_peak_datetime_utc,
        interface
    );
