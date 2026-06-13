{{
  config(
    materialized='ephemeral'
  )
}}

---------------------------
-- PJM Daily Generation Capacity normalized from PJM Data Miner 2.
-- Grain: source contract from pjm.day_gen_capacity; primary key bid_datetime_beginning_utc.
---------------------------

SELECT
    bid_datetime_beginning_ept
    ,bid_datetime_beginning_utc
    ,eco_max
    ,emerg_max
    ,total_committed
FROM "{{ target.database }}"."pjm"."day_gen_capacity"
WHERE
    bid_datetime_beginning_ept >= '2014-01-01'::timestamp
