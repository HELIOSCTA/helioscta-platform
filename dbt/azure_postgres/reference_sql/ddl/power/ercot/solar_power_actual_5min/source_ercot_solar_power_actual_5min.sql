{{
  config(
    materialized='ephemeral'
  )
}}

---------------------------
-- ERCOT Solar Power Production actual 5-minute averaged values.
-- Grain: source contract from ercot.solar_power_actual_5min; primary key posteddatetime, intervalending.
---------------------------

SELECT
    posteddatetime
    ,intervalending
    ,gensystemwide
    ,hslsystemwide
    ,dstflag
    ,updated_at
FROM "{{ target.database }}"."ercot"."solar_power_actual_5min"
WHERE
    intervalending >= '2010-01-01'::timestamp
