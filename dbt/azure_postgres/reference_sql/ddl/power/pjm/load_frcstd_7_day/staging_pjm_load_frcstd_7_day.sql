{{
  config(
    materialized='ephemeral'
  )
}}

---------------------------
-- PJM Seven-Day Load Forecast.
-- Grain: source contract from pjm.load_frcstd_7_day; primary key evaluated_at_datetime_utc, forecast_datetime_beginning_utc, forecast_area.
---------------------------

SELECT
    evaluated_at_datetime_ept
    ,evaluated_at_datetime_utc
    ,forecast_area
    ,forecast_datetime_beginning_ept
    ,forecast_datetime_beginning_utc
    ,forecast_datetime_ending_ept
    ,forecast_datetime_ending_utc
    ,forecast_load_mw
FROM {{ ref('source_pjm_load_frcstd_7_day') }}
