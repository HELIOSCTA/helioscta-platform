{{
  config(
    materialized='ephemeral'
  )
}}

SELECT * FROM {{ ref('staging_ercot_lmps_rt_hourly') }}

