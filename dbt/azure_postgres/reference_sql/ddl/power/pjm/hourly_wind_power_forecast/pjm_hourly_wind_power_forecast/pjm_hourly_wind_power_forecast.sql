{{
  config(
    materialized='view'
  )
}}

SELECT * FROM {{ ref('staging_pjm_hourly_wind_power_forecast') }}
