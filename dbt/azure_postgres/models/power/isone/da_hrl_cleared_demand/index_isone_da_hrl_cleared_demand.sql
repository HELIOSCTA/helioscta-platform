-- Index DDL for isone.da_hrl_cleared_demand.
--
-- This file is disabled as a dbt model in dbt_project.yml. It is retained as
-- operator reference SQL only. Read-only dbt credentials cannot run this.
-- Run manually with helios_admin after table_isone_da_hrl_cleared_demand.sql.

CREATE INDEX IF NOT EXISTS idx_isone_da_hrl_cleared_demand_date_hour
ON isone.da_hrl_cleared_demand (
    date,
    hour_ending
);
