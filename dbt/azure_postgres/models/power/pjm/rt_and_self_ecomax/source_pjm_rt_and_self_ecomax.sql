{{
  config(
    materialized='ephemeral'
  )
}}

---------------------------
-- PJM Scheduled Generation normalized from PJM Data Miner 2.
-- Grain: source contract from pjm.rt_and_self_ecomax; primary key datetime_beginning_utc.
---------------------------

SELECT
    datetime_beginning_utc
    ,datetime_beginning_ept
    ,rt_ecomax
    ,conf_disclaimer
    ,self_ecomax
FROM "{{ target.database }}"."pjm"."rt_and_self_ecomax"
WHERE
    datetime_beginning_ept >= '2017-10-01'::timestamp
