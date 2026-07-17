{{
  config(
    materialized='ephemeral'
  )
}}

---------------------------
-- ISO-NE hourly actual system demand from ISO Express CSV reports.
-- Source: https://www.iso-ne.com/isoexpress/web/reports/load-and-demand
-- Grain: date x hour ending.
-- Primary key: date, hour_ending.
-- Freshness field: date.
---------------------------

SELECT
    date
    ,hour_ending
    ,total_load
FROM "{{ target.database }}"."isone"."hourly_system_demand"
WHERE
    date >= (CURRENT_DATE - INTERVAL '7 years')
