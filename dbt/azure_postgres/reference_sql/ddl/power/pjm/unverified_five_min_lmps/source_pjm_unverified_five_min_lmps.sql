{{
  config(
    materialized='ephemeral'
  )
}}

---------------------------
-- PJM unverified five-minute LMPs normalized from PJM Data Miner.
-- Grain: 1 row per five-minute interval x hub.
---------------------------

SELECT
    datetime_beginning_ept::date AS date
    ,datetime_beginning_ept AS interval_beginning_ept
    ,datetime_beginning_utc AS interval_beginning_utc
    ,datetime_beginning_ept + INTERVAL '5 minutes' AS interval_ending_ept
    ,datetime_beginning_utc + INTERVAL '5 minutes' AS interval_ending_utc

    ,name AS hub
    ,type AS pnode_type

    ,five_min_rtlmp AS unverified_five_min_rtlmp
    ,hourly_lmp AS prior_hour_lmp

FROM "{{ target.database }}"."pjm"."unverified_five_min_lmps"
WHERE
    datetime_beginning_ept >= '2014-01-01'::timestamp
