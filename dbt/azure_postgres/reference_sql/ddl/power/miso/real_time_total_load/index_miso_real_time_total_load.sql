-- Source-table indexes for miso.real_time_total_load.
--
-- This file is disabled as a dbt model in dbt_project.yml. It is retained as
-- operator reference SQL only. Read-only dbt credentials cannot run this.

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_miso_real_time_total_load_updated_at
    ON miso.real_time_total_load (updated_at DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_miso_real_time_total_load_operating_date
    ON miso.real_time_total_load (operating_date DESC, series, period_label);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_miso_real_time_total_load_interval_start
    ON miso.real_time_total_load (interval_start DESC)
    WHERE interval_start IS NOT NULL;
