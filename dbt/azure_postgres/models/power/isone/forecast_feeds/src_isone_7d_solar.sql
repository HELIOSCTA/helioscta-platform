{{
  config(
    materialized='ephemeral'
  )
}}

SELECT
    forecast_execution_date
    ,forecast_date
    ,hour_ending
    ,solar_forecast_mw
FROM "{{ target.database }}"."isone"."seven_day_solar_forecast"
WHERE forecast_date >= (CURRENT_DATE - INTERVAL '7 years')
