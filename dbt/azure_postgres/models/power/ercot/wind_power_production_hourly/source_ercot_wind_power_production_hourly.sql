{{
  config(
    materialized='ephemeral'
  )
}}

---------------------------
-- ERCOT Wind Power Production hourly actual and forecast values.
-- Grain: source contract from ercot.wind_power_production_hourly; primary key posteddatetime, deliverydate, hourending.
---------------------------

SELECT
    posteddatetime
    ,deliverydate
    ,hourending
    ,gensystemwide
    ,cophslsystemwide
    ,stwpfsystemwide
    ,wgrppsystemwide
    ,genloadzonesouthhouston
    ,cophslloadzonesouthhouston
    ,stwpfloadzonesouthhouston
    ,wgrpploadzonesouthhouston
    ,genloadzonewest
    ,cophslloadzonewest
    ,stwpfloadzonewest
    ,wgrpploadzonewest
    ,genloadzonenorth
    ,cophslloadzonenorth
    ,stwpfloadzonenorth
    ,wgrpploadzonenorth
    ,hslsystemwide
    ,updated_at
FROM "{{ target.database }}"."ercot"."wind_power_production_hourly"
WHERE
    deliverydate >= '2010-01-01'::date
