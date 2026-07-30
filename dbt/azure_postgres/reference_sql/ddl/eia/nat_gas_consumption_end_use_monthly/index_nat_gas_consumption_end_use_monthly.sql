-- Source-table indexes for eia.nat_gas_consumption_end_use_monthly.
--
-- This file is disabled as a dbt model in dbt_project.yml. It is retained as
-- operator reference SQL only. If an operator applies it, use a write-capable
-- role in a SQL editor with autocommit enabled. Do not wrap
-- CREATE INDEX CONCURRENTLY in BEGIN/COMMIT.

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_eia_ng_consumption_updated_at
    ON eia.nat_gas_consumption_end_use_monthly (updated_at DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_eia_ng_consumption_month_area_process
    ON eia.nat_gas_consumption_end_use_monthly (
        report_month DESC,
        duoarea,
        process
    )
    INCLUDE (
        value_mmcf,
        units
    );

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_eia_ng_consumption_series
    ON eia.nat_gas_consumption_end_use_monthly (
        series,
        report_month DESC
    )
    INCLUDE (
        value_mmcf,
        area_name,
        process_name
    );
