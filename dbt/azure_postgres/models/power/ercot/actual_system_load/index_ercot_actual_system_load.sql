-- Source-table indexes for ercot.actual_system_load.
--
-- This file is disabled as a dbt model in dbt_project.yml. It is retained as
-- operator reference SQL only. Read-only dbt credentials cannot run this.

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ercot_actual_system_load_updated_at
    ON ercot.actual_system_load (updated_at DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ercot_actual_system_load_operatingday
    ON ercot.actual_system_load (operatingday DESC, hourending);
