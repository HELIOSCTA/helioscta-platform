{{
  config(
    materialized='ephemeral'
  )
}}

SELECT
    posteddatetime AS posted_datetime,
    deliverydate AS delivery_date,
    hourending,
    'system_wide' AS region,
    gensystemwide AS generation_mw,
    cophslsystemwide AS cop_hsl_mw,
    stppfsystemwide AS stppf_mw,
    pvgrppsystemwide AS pvgrpp_mw,
    hslsystemwide AS hsl_mw,
    updated_at
FROM {{ ref('source_ercot_solar_power_production_hourly') }}
WHERE
    gensystemwide IS NOT NULL
    OR cophslsystemwide IS NOT NULL
    OR stppfsystemwide IS NOT NULL
    OR pvgrppsystemwide IS NOT NULL
    OR hslsystemwide IS NOT NULL
