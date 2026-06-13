{{
  config(
    materialized='ephemeral'
  )
}}

---------------------------
-- PJM Hourly Load: Preliminary normalized from PJM Data Miner 2.
-- Grain: source contract from pjm.hrl_load_prelim; primary key datetime_beginning_utc, load_area.
---------------------------

SELECT
    datetime_beginning_ept
    ,datetime_beginning_utc
    ,datetime_ending_ept
    ,datetime_ending_utc
    ,load_area
    ,prelim_load_avg_hourly
FROM "{{ target.database }}"."pjm"."hrl_load_prelim"
WHERE
    datetime_beginning_ept >= '2014-01-01'::timestamp
