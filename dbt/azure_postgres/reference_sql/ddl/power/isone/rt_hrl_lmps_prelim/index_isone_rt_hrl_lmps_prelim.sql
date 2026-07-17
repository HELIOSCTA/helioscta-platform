-- Index DDL for isone.rt_hrl_lmps_prelim.
--
-- This file is disabled as a dbt model in dbt_project.yml. It is retained as
-- operator reference SQL only. Read-only dbt credentials cannot run this.
-- Run manually with helios_admin after table_isone_rt_hrl_lmps_prelim.sql.

CREATE INDEX IF NOT EXISTS idx_isone_rt_hrl_lmps_prelim_location_date_hour
ON isone.rt_hrl_lmps_prelim (
    location,
    date,
    hour_ending
);

CREATE INDEX IF NOT EXISTS idx_isone_rt_hrl_lmps_prelim_internal_hub_date_hour
ON isone.rt_hrl_lmps_prelim (
    date,
    hour_ending
)
WHERE location = '.H.INTERNAL_HUB';
