{{
  config(
    materialized='ephemeral'
  )
}}

---------------------------
-- ERCOT Wind Power Production actual 5-minute averaged values.
-- Grain: source contract from ercot.wind_power_actual_5min; primary key posteddatetime, intervalending.
---------------------------

SELECT
    posteddatetime
    ,intervalending
    ,gensystemwide
    ,lzsouthhouston
    ,lzwest
    ,lznorth
    ,hslsystemwide
    ,dstflag
    ,updated_at
FROM "{{ target.database }}"."ercot"."wind_power_actual_5min"
WHERE
    intervalending >= '2010-01-01'::timestamp
