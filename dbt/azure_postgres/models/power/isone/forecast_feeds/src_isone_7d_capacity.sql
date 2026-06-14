{{
  config(
    materialized='ephemeral'
  )
}}

SELECT
    *
FROM "{{ target.database }}"."isone"."seven_day_capacity_forecast"
WHERE date >= (CURRENT_DATE - INTERVAL '7 years')
