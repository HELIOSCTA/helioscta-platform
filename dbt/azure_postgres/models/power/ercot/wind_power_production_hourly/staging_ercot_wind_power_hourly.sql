{{
  config(
    materialized='ephemeral'
  )
}}

WITH source AS (
    SELECT *
    FROM {{ ref('source_ercot_wind_power_production_hourly') }}
),

unpivoted AS (
    SELECT posteddatetime, deliverydate, hourending, 'system_wide' AS region, gensystemwide AS generation_mw, cophslsystemwide AS cop_hsl_mw, stwpfsystemwide AS stwpf_mw, wgrppsystemwide AS wgrpp_mw, hslsystemwide AS hsl_mw, updated_at FROM source
    UNION ALL
    SELECT posteddatetime, deliverydate, hourending, 'load_zone_south_houston' AS region, genloadzonesouthhouston AS generation_mw, cophslloadzonesouthhouston AS cop_hsl_mw, stwpfloadzonesouthhouston AS stwpf_mw, wgrpploadzonesouthhouston AS wgrpp_mw, NULL::double precision AS hsl_mw, updated_at FROM source
    UNION ALL
    SELECT posteddatetime, deliverydate, hourending, 'load_zone_west' AS region, genloadzonewest AS generation_mw, cophslloadzonewest AS cop_hsl_mw, stwpfloadzonewest AS stwpf_mw, wgrpploadzonewest AS wgrpp_mw, NULL::double precision AS hsl_mw, updated_at FROM source
    UNION ALL
    SELECT posteddatetime, deliverydate, hourending, 'load_zone_north' AS region, genloadzonenorth AS generation_mw, cophslloadzonenorth AS cop_hsl_mw, stwpfloadzonenorth AS stwpf_mw, wgrpploadzonenorth AS wgrpp_mw, NULL::double precision AS hsl_mw, updated_at FROM source
)

SELECT
    posteddatetime AS posted_datetime,
    deliverydate AS delivery_date,
    hourending,
    region,
    generation_mw,
    cop_hsl_mw,
    stwpf_mw,
    wgrpp_mw,
    hsl_mw,
    updated_at
FROM unpivoted
WHERE
    generation_mw IS NOT NULL
    OR cop_hsl_mw IS NOT NULL
    OR stwpf_mw IS NOT NULL
    OR wgrpp_mw IS NOT NULL
    OR hsl_mw IS NOT NULL
