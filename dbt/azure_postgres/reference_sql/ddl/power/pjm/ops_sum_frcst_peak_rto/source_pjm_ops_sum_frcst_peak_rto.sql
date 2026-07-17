{{
  config(
    materialized='ephemeral'
  )
}}

---------------------------
-- PJM Operations Summary projected RTO statistics at peak.
-- Grain: projected peak UTC x area.
---------------------------

SELECT
    area
    ,capacity_adjustments
    ,generated_at_ept
    ,internal_scheduled_capacity
    ,load_forecast
    ,operating_reserve
    ,projected_peak_datetime_ept
    ,projected_peak_datetime_utc
    ,scheduled_tie_flow_total
    ,total_scheduled_capacity
    ,unscheduled_steam_capacity
FROM "{{ target.database }}"."pjm"."ops_sum_frcst_peak_rto"
WHERE
    projected_peak_datetime_ept >= '2011-01-01'::timestamp
