-- Index DDL for isone.da_hrl_lmps.
--
-- This file is disabled as a dbt model in dbt_project.yml. It is retained as
-- operator reference SQL only. Read-only dbt credentials cannot run this.
-- Run manually with helios_admin after table_isone_da_hrl_lmps.sql.
-- The table contract is hub-only, so a date/hour index is sufficient for
-- downstream time-series access.

DROP INDEX IF EXISTS isone.idx_isone_da_hrl_lmps_location_date_hour;
DROP INDEX IF EXISTS isone.idx_isone_da_hrl_lmps_internal_hub_date_hour;

CREATE INDEX IF NOT EXISTS idx_isone_da_hrl_lmps_date_hour
ON isone.da_hrl_lmps (
    date,
    hour_ending
);
