{{
  config(
    materialized='ephemeral'
  )
}}

SELECT *
FROM {{ ref('staging_weather_noaa_metar_observations') }}
