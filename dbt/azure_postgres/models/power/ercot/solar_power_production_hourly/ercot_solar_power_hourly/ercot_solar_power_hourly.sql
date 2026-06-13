{{
  config(
    materialized='ephemeral'
  )
}}

SELECT * FROM {{ ref('staging_ercot_solar_power_hourly') }}
