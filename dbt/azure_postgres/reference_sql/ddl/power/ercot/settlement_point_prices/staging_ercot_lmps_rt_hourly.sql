{{
  config(
    materialized='ephemeral'
  )
}}

---------------------------
-- ERCOT real-time hourly settlement point price averages.
-- Grain: delivery date x hour ending x settlement point.
---------------------------

SELECT
    date
    ,hour_ending
    ,settlement_point
    ,settlement_point_type
    ,AVG(rt_spp) AS rt_spp
    ,COUNT(*) AS intervals_present
FROM {{ ref('staging_ercot_lmps_rt_15min') }}
GROUP BY
    date
    ,hour_ending
    ,settlement_point
    ,settlement_point_type
