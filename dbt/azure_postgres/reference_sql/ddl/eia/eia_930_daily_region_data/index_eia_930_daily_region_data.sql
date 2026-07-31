-- Source-table indexes for eia.eia_930_daily_region_data.
--
-- This file is disabled as a dbt model in dbt_project.yml. It is retained as
-- operator reference SQL only. If an operator applies it, use a write-capable
-- role in a SQL editor with autocommit enabled. Do not wrap
-- CREATE INDEX CONCURRENTLY in BEGIN/COMMIT.

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_eia_930_daily_region_updated_at
    ON eia.eia_930_daily_region_data (updated_at DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_eia_930_daily_region_period_respondent
    ON eia.eia_930_daily_region_data (
        period DESC,
        respondent,
        type,
        timezone
    )
    INCLUDE (
        value,
        type_name
    );

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_eia_930_daily_region_timezone
    ON eia.eia_930_daily_region_data (
        timezone,
        period DESC,
        respondent
    )
    INCLUDE (
        type,
        value
    );
