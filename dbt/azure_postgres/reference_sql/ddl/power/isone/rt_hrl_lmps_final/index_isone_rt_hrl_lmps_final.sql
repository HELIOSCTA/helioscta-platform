-- Index DDL for isone.rt_hrl_lmps_final.
--
-- This file is disabled as a dbt model in dbt_project.yml. It is retained as
-- operator reference SQL only. Read-only dbt credentials cannot run this.
-- Run manually with helios_admin after table_isone_rt_hrl_lmps_final.sql.
-- The table contract is hub-only, so a date/hour index is sufficient for
-- downstream time-series access.

DROP INDEX IF EXISTS isone.idx_isone_rt_hrl_lmps_final_location_date_hour;
DROP INDEX IF EXISTS isone.idx_isone_rt_hrl_lmps_final_internal_hub_date_hour;

CREATE INDEX IF NOT EXISTS idx_isone_rt_hrl_lmps_final_date_hour
ON isone.rt_hrl_lmps_final (
    date,
    hour_ending
);
