{{
  config(
    materialized='ephemeral'
  )
}}

---------------------------
-- PJM Hourly Solar Power Forecast normalized from PJM Data Miner 2.
-- Grain: source contract from pjm.hourly_solar_power_forecast; primary key evaluated_at_utc, datetime_beginning_utc.
---------------------------

SELECT
    evaluated_at_utc
    ,evaluated_at_ept
    ,datetime_beginning_utc
    ,datetime_beginning_ept
    ,datetime_ending_utc
    ,datetime_ending_ept
    ,solar_forecast_mwh
    ,solar_forecast_btm_mwh
FROM "{{ target.database }}"."pjm"."hourly_solar_power_forecast"
WHERE
    evaluated_at_ept >= '2014-01-01'::timestamp
