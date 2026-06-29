{{
  config(
    materialized='ephemeral'
  )
}}

---------------------------
-- PJM Operations Summary projected area statistics at peak.
-- Grain: projected peak UTC x generated_at_ept x area.
---------------------------

SELECT
    area
    ,generated_at_ept
    ,internal_scheduled_capacity
    ,pjm_load_forecast
    ,projected_peak_datetime_ept
    ,projected_peak_datetime_utc
    ,unscheduled_steam_capacity
FROM {{ ref('source_pjm_ops_sum_frcst_peak_area') }}
