-- Source-table indexes for ice_python.settlement_contract_dates.
--
-- This file is disabled as a dbt model in dbt_project.yml. It is retained as
-- operator reference SQL only. Read-only dbt credentials cannot run this.

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ice_python_settlement_contract_dates_updated_at
    ON ice_python.settlement_contract_dates (updated_at DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ice_python_settlement_contract_dates_symbol_trade_date
    ON ice_python.settlement_contract_dates (symbol, trade_date DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ice_python_settlement_contract_dates_delivery_window
    ON ice_python.settlement_contract_dates (start_date, end_date)
    WHERE start_date IS NOT NULL
      AND end_date IS NOT NULL;
