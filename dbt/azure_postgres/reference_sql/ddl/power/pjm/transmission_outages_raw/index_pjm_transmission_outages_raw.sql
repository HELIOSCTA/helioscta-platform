-- Source-table indexes for pjm.transmission_outages_raw.
--
-- This file is disabled as a dbt model in dbt_project.yml. It is retained as
-- operator reference SQL only. If an operator applies it, use a write-capable
-- role in a SQL editor with autocommit enabled. Do not wrap
-- CREATE INDEX CONCURRENTLY in BEGIN/COMMIT.

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_pjm_transmission_outages_raw_report
    ON pjm.transmission_outages_raw (
        source_report_timestamp DESC
    );

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_pjm_transmission_outages_raw_retention
    ON pjm.transmission_outages_raw (
        ingested_at
    );
