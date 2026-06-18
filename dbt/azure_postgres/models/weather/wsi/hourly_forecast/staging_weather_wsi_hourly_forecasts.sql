{{
  config(
    materialized='ephemeral'
  )
}}

SELECT *
FROM {{ ref('source_weather_wsi_hourly_forecasts') }}
