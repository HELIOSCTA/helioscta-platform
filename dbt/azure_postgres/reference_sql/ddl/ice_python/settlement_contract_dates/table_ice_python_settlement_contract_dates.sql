-- Source-table DDL for ice_python.settlement_contract_dates.
--
-- This file is disabled as a dbt model in dbt_project.yml. It is retained as
-- operator reference SQL only. Read-only dbt credentials cannot run this.
-- Apply it manually with the helios_admin role before enabling local Windows
-- service jobs under backend.orchestration.ice_python.

CREATE TABLE IF NOT EXISTS ice_python.settlement_contract_dates (
    trade_date DATE NOT NULL,
    symbol VARCHAR NOT NULL,
    strip VARCHAR,
    start_date DATE,
    end_date DATE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (trade_date, symbol)
);
