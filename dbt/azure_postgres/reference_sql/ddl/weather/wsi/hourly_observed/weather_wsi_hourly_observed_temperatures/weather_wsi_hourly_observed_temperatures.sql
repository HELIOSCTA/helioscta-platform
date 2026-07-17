{{
  config(
    materialized='ephemeral'
  )
}}

SELECT *
FROM {{ ref('staging_weather_wsi_hourly_observed_temperatures') }}
