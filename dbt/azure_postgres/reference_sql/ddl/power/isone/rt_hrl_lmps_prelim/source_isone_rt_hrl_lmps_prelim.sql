{{
  config(
    materialized='ephemeral'
  )
}}

---------------------------
-- ISO-NE preliminary RT hourly LMPs from ISO Express CSV reports.
-- Source: https://www.iso-ne.com/isoexpress/web/reports/pricing/-/tree/lmps-rt-hourly-prelim
-- Grain: date x hour ending x ISO-NE internal hub.
-- Primary key: date, hour_ending, location.
-- Freshness field: date.
---------------------------

SELECT
    date
    ,hour_ending
    ,location
    ,lmp
    ,energy
    ,congestion
    ,loss
FROM "{{ target.database }}"."isone"."rt_hrl_lmps_prelim"
WHERE
    date >= (CURRENT_DATE - INTERVAL '7 years')
    AND location = '.H.INTERNAL_HUB'
