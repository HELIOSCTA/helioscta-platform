{{
  config(
    materialized='ephemeral'
  )
}}

---------------------------
-- PJM Hourly Wind Power Forecast.
-- Grain: source contract from pjm.hourly_wind_power_forecast; primary key evaluated_at_utc, datetime_beginning_utc.
---------------------------

SELECT
    evaluated_at_utc
    ,evaluated_at_ept
    ,datetime_beginning_utc
    ,datetime_beginning_ept
    ,datetime_ending_utc
    ,datetime_ending_ept
    ,wind_forecast_mwh
FROM {{ ref('source_pjm_hourly_wind_power_forecast') }}
