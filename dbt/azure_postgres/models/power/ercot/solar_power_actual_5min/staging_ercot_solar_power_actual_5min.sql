{{
  config(
    materialized='ephemeral'
  )
}}

SELECT
    posteddatetime AS posted_datetime,
    intervalending AS interval_ending,
    'system_wide' AS region,
    gensystemwide AS generation_mw,
    hslsystemwide AS hsl_mw,
    dstflag AS dst_flag,
    updated_at
FROM {{ ref('source_ercot_solar_power_actual_5min') }}
WHERE
    gensystemwide IS NOT NULL
    OR hslsystemwide IS NOT NULL
