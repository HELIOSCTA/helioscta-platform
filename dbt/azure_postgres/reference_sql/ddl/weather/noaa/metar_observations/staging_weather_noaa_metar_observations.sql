{{
  config(
    materialized='ephemeral'
  )
}}

SELECT *
FROM {{ ref('source_weather_noaa_metar_observations') }}
