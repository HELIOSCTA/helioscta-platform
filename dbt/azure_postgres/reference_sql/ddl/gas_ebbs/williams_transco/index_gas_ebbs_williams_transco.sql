-- Source-table indexes for Williams Transco gas EBB notices.
--
-- This file is disabled as a dbt model in dbt_project.yml. It is retained as
-- operator reference SQL only. If an operator applies it, use a write-capable
-- role in a SQL editor with autocommit enabled. Do not wrap
-- CREATE INDEX CONCURRENTLY in BEGIN/COMMIT.

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_gas_ebbs_notices_current_posted
    ON gas_ebbs.notices (
        pipeline_key,
        is_current_on_ebb,
        posted_at_utc DESC
    )
    INCLUDE (
        source_notice_id,
        notice_stream,
        notice_type
    );

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_gas_ebbs_notices_last_seen
    ON gas_ebbs.notices (
        pipeline_key,
        last_seen_at_utc DESC
    );

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_gas_ebbs_notices_stale_retention
    ON gas_ebbs.notices (
        is_current_on_ebb,
        stale_at_utc
    );

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_gas_ebbs_notice_revisions_observed
    ON gas_ebbs.notice_revisions (
        pipeline_key,
        revision_observed_at_utc DESC
    );

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_gas_ebbs_notice_details_fetched
    ON gas_ebbs.notice_details (
        pipeline_key,
        detail_fetched_at_utc DESC
    );

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_gas_ebbs_planned_outages_effective
    ON gas_ebbs.planned_outages (
        pipeline_key,
        effective_start_at_utc DESC,
        location_id
    )
    INCLUDE (
        job_number,
        available_capacity_mdt_per_day
    );
