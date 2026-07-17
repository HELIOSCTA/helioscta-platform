{{
  config(
    materialized='ephemeral'
  )
}}

---------------------------
-- PJM Wind Generation normalized from PJM Data Miner 2.
-- Grain: source contract from pjm.wind_gen; primary key datetime_beginning_utc, area.
---------------------------

SELECT
    area
    ,datetime_beginning_ept
    ,datetime_beginning_utc
    ,wind_generation_mw
FROM "{{ target.database }}"."pjm"."wind_gen"
WHERE
    datetime_beginning_ept >= '2014-01-01'::timestamp
