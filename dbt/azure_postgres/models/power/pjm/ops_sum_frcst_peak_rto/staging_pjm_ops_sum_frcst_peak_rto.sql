{{
  config(
    materialized='ephemeral'
  )
}}

---------------------------
-- PJM Operations Summary projected RTO statistics at peak.
-- Grain: projected peak UTC x generated_at_ept x area.
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
FROM {{ ref('source_pjm_ops_sum_frcst_peak_rto') }}
