{{
  config(
    materialized='ephemeral'
  )
}}

---------------------------
-- PJM Historical Load Forecasts normalized from PJM Data Miner 2.
-- Grain: source contract from pjm.load_frcstd_hist; primary key evaluated_at_utc, evaluated_at_ept, forecast_hour_beginning_utc, forecast_hour_beginning_ept, forecast_area.
---------------------------

SELECT
    evaluated_at_ept
    ,evaluated_at_utc
    ,forecast_area
    ,forecast_hour_beginning_ept
    ,forecast_hour_beginning_utc
    ,forecast_load_mw
FROM "{{ target.database }}"."pjm"."load_frcstd_hist"
WHERE
    forecast_hour_beginning_ept >= '2014-01-01'::timestamp
