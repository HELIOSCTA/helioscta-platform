{{
  config(
    materialized='ephemeral'
  )
}}

---------------------------
-- PJM Seven-Day Load Forecast normalized from PJM Data Miner 2.
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
FROM "{{ target.database }}"."pjm"."load_frcstd_7_day"
WHERE
    evaluated_at_datetime_ept >= '2014-01-01'::timestamp
