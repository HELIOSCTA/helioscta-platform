-- Source-table indexes for eia.eia_930_daily_generation_by_fuel.
--
-- This file is disabled as a dbt model in dbt_project.yml. It is retained as
-- operator reference SQL only. If an operator applies it, use a write-capable
-- role in a SQL editor with autocommit enabled. Do not wrap
-- CREATE INDEX CONCURRENTLY in BEGIN/COMMIT.

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_eia_930_daily_gen_updated_at
    ON eia.eia_930_daily_generation_by_fuel (updated_at DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_eia_930_daily_gen_period_respondent
    ON eia.eia_930_daily_generation_by_fuel (
        period DESC,
        respondent,
        fueltype,
        timezone
    )
    INCLUDE (
        value,
        type_name
    );

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_eia_930_daily_gen_timezone
    ON eia.eia_930_daily_generation_by_fuel (
        timezone,
        period DESC,
        respondent
    )
    INCLUDE (
        fueltype,
        value
    );
