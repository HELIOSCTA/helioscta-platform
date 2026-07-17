-- Source-table indexes for ice_python.settlements.
--
-- This file is disabled as a dbt model in dbt_project.yml. It is retained as
-- operator reference SQL only. Read-only dbt credentials cannot run this.

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ice_python_settlements_updated_at
    ON ice_python.settlements (updated_at DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ice_python_settlements_symbol_trade_date
    ON ice_python.settlements (symbol, trade_date DESC);
