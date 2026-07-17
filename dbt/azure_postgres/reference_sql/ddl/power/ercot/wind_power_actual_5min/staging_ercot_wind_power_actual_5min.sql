{{
  config(
    materialized='ephemeral'
  )
}}

WITH source AS (
    SELECT *
    FROM {{ ref('source_ercot_wind_power_actual_5min') }}
),

unpivoted AS (
    SELECT posteddatetime, intervalending, 'system_wide' AS region, gensystemwide AS generation_mw, hslsystemwide AS hsl_mw, dstflag, updated_at FROM source
    UNION ALL
    SELECT posteddatetime, intervalending, 'load_zone_south_houston' AS region, lzsouthhouston AS generation_mw, NULL::double precision AS hsl_mw, dstflag, updated_at FROM source
    UNION ALL
    SELECT posteddatetime, intervalending, 'load_zone_west' AS region, lzwest AS generation_mw, NULL::double precision AS hsl_mw, dstflag, updated_at FROM source
    UNION ALL
    SELECT posteddatetime, intervalending, 'load_zone_north' AS region, lznorth AS generation_mw, NULL::double precision AS hsl_mw, dstflag, updated_at FROM source
)

SELECT
    posteddatetime AS posted_datetime,
    intervalending AS interval_ending,
    region,
    generation_mw,
    hsl_mw,
    dstflag AS dst_flag,
    updated_at
FROM unpivoted
WHERE
    generation_mw IS NOT NULL
    OR hsl_mw IS NOT NULL
