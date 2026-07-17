-- Indexes for ops.api_fetch_log.
--
-- This file is disabled as a dbt model in dbt_project.yml. It is retained as
-- operator reference SQL only. Read-only dbt credentials cannot run this.
-- Apply it manually with the helios_admin role after applying
-- table_ops_api_fetch_log.sql.

CREATE INDEX IF NOT EXISTS idx_api_fetch_log_created_at
    ON ops.api_fetch_log (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_api_fetch_log_pipeline
    ON ops.api_fetch_log (provider, operation_name, created_at DESC);
