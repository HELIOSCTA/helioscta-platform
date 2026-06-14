{{
  config(
    materialized='ephemeral'
  )
}}

---------------------------
-- ISO-NE day-ahead hourly cleared demand from ISO Express CSV reports.
-- Source: https://www.iso-ne.com/isoexpress/web/reports/load-and-demand
-- Grain: date x hour ending.
-- Primary key: date, hour_ending.
-- Freshness field: date.
---------------------------

SELECT
    date
    ,hour_ending
    ,day_ahead_cleared_demand
FROM "{{ target.database }}"."isone"."da_hrl_cleared_demand"
WHERE
    date >= (CURRENT_DATE - INTERVAL '7 years')
