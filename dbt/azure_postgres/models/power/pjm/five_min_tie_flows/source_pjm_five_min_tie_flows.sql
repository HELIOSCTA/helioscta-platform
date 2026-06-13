{{
  config(
    materialized='ephemeral'
  )
}}

---------------------------
-- PJM five-minute tie flows normalized from PJM Data Miner 2.
-- Grain: 1 row per five-minute interval x tie flow.
---------------------------

SELECT
    datetime_beginning_ept::date AS date
    ,datetime_beginning_ept AS interval_beginning_ept
    ,datetime_beginning_utc AS interval_beginning_utc
    ,datetime_beginning_ept + INTERVAL '5 minutes' AS interval_ending_ept
    ,datetime_beginning_utc + INTERVAL '5 minutes' AS interval_ending_utc

    ,tie_flow_name
    ,actual_mw
    ,scheduled_mw

FROM "{{ target.database }}"."pjm"."five_min_tie_flows"
WHERE
    datetime_beginning_ept >= '2014-01-01'::timestamp
