-- Index DDL for isone.rt_hrl_lmps_final.
--
-- This file is disabled as a dbt model in dbt_project.yml. It is retained as
-- operator reference SQL only. Read-only dbt credentials cannot run this.
-- Run manually with helios_admin after table_isone_rt_hrl_lmps_final.sql.

CREATE INDEX IF NOT EXISTS idx_isone_rt_hrl_lmps_final_location_date_hour
ON isone.rt_hrl_lmps_final (
    location_name,
    location_type,
    date,
    hour_ending
);

CREATE INDEX IF NOT EXISTS idx_isone_rt_hrl_lmps_final_internal_hub_date_hour
ON isone.rt_hrl_lmps_final (
    date,
    hour_ending
)
WHERE
    location_name = '.H.INTERNAL_HUB'
    AND location_type = 'HUB';
