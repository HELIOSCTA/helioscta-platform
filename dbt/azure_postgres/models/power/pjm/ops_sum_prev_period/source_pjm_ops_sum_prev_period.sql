{{
  config(
    materialized='ephemeral'
  )
}}

---------------------------
-- PJM Operations Summary actual operational statistics.
-- Grain: operating hour UTC x generated_at_ept x area.
---------------------------

SELECT
    actual_load
    ,area
    ,area_load_forecast
    ,datetime_beginning_ept
    ,datetime_beginning_utc
    ,datetime_ending_ept
    ,datetime_ending_utc
    ,dispatch_rate
    ,generated_at_ept
FROM "{{ target.database }}"."pjm"."ops_sum_prev_period"
WHERE
    datetime_beginning_ept >= '2011-01-01'::timestamp
