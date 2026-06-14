-- Index DDL for isone.hourly_system_demand.
--
-- This file is disabled as a dbt model in dbt_project.yml. It is retained as
-- operator reference SQL only. Read-only dbt credentials cannot run this.
-- Run manually with helios_admin after table_isone_hourly_system_demand.sql.

CREATE INDEX IF NOT EXISTS idx_isone_hourly_system_demand_date_hour
ON isone.hourly_system_demand (
    date,
    hour_ending
);
