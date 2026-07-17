{{
  config(
    materialized='ephemeral'
  )
}}

SELECT
    published_date
    ,forecast_date
    ,hour_ending
    ,reliability_region
    ,mw
    ,percentage
FROM "{{ target.database }}"."isone"."three_day_reliability_region_demand_forecast"
WHERE forecast_date >= (CURRENT_DATE - INTERVAL '7 years')
