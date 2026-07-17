{{
  config(
    materialized='ephemeral'
  )
}}

---------------------------
-- PJM Solar Generation normalized from PJM Data Miner 2.
-- Grain: source contract from pjm.solar_gen; primary key datetime_beginning_utc, area.
---------------------------

SELECT
    area
    ,datetime_beginning_ept
    ,datetime_beginning_utc
    ,solar_generation_mw
FROM "{{ target.database }}"."pjm"."solar_gen"
WHERE
    datetime_beginning_ept >= '2014-01-01'::timestamp
