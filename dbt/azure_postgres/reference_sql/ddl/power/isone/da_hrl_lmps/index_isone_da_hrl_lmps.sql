-- Index DDL for isone.da_hrl_lmps.
--
-- This file is disabled as a dbt model in dbt_project.yml. It is retained as
-- operator reference SQL only. Read-only dbt credentials cannot run this.
-- Run manually with helios_admin after table_isone_da_hrl_lmps.sql.

CREATE INDEX IF NOT EXISTS idx_isone_da_hrl_lmps_location_date_hour
ON isone.da_hrl_lmps (
    location_name,
    location_type,
    date,
    hour_ending
);

CREATE INDEX IF NOT EXISTS idx_isone_da_hrl_lmps_internal_hub_date_hour
ON isone.da_hrl_lmps (
    date,
    hour_ending
)
WHERE
    location_name = '.H.INTERNAL_HUB'
    AND location_type = 'HUB';
