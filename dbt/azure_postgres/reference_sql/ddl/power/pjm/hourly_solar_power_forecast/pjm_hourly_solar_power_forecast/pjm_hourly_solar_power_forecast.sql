{{
  config(
    materialized='view'
  )
}}

SELECT * FROM {{ ref('staging_pjm_hourly_solar_power_forecast') }}
