{{
  config(
    materialized='ephemeral'
  )
}}

---------------------------
-- ERCOT Solar Power Production hourly actual and forecast values.
-- Grain: source contract from ercot.solar_power_production_hourly; primary key posteddatetime, deliverydate, hourending.
---------------------------

SELECT
    posteddatetime
    ,deliverydate
    ,hourending
    ,gensystemwide
    ,cophslsystemwide
    ,stppfsystemwide
    ,pvgrppsystemwide
    ,hslsystemwide
    ,updated_at
FROM "{{ target.database }}"."ercot"."solar_power_production_hourly"
WHERE
    deliverydate >= '2016-01-01'::date
