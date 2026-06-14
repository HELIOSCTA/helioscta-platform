-- Index DDL for isone.rt_hrl_scheduled_interchange.
--
-- This file is disabled as a dbt model in dbt_project.yml. It is retained as
-- operator reference SQL only. Read-only dbt credentials cannot run this.
-- Run manually with helios_admin after table SQL.

CREATE INDEX IF NOT EXISTS idx_isone_rt_hrl_scheduled_interchange_date_hour
ON isone.rt_hrl_scheduled_interchange (
    local_date,
    local_hour_ending
);

CREATE INDEX IF NOT EXISTS idx_isone_rt_hrl_scheduled_interchange_interface_date
ON isone.rt_hrl_scheduled_interchange (
    interface_name,
    local_date
);
