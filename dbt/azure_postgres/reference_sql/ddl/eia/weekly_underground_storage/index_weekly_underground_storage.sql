-- Source-table indexes for eia.weekly_underground_storage.
--
-- This file is disabled as a dbt model in dbt_project.yml. It is retained as
-- operator reference SQL only. If an operator applies it, use a write-capable
-- role in a SQL editor with autocommit enabled. Do not wrap
-- CREATE INDEX CONCURRENTLY in BEGIN/COMMIT.

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_eia_weekly_storage_updated_at
    ON eia.weekly_underground_storage (updated_at DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_eia_weekly_storage_week_region
    ON eia.weekly_underground_storage (
        eia_week_ending DESC,
        region,
        process
    )
    INCLUDE (
        value_bcf,
        units
    );

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_eia_weekly_storage_series
    ON eia.weekly_underground_storage (
        series,
        eia_week_ending DESC
    )
    INCLUDE (
        value_bcf,
        region
    );
