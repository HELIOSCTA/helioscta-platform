{{
  config(
    materialized='ephemeral'
  )
}}

---------------------------
-- PJM Five Minute Solar Generation normalized from PJM Data Miner 2.
-- Grain: source contract from pjm.five_min_solar_generation; primary key datetime_beginning_utc.
---------------------------

SELECT
    datetime_beginning_ept
    ,datetime_beginning_utc
    ,solar_generation_mw
FROM "{{ target.database }}"."pjm"."five_min_solar_generation"
WHERE
    datetime_beginning_ept >= '2014-01-01'::timestamp
