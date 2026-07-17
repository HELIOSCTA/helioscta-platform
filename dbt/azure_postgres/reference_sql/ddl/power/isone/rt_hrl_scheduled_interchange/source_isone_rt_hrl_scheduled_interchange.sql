{{
  config(
    materialized='ephemeral'
  )
}}

---------------------------
-- ISO-NE real-time hourly actual scheduled interchange.
-- Source: https://www.iso-ne.com/isoexpress/web/reports/grid/-/tree/interchange-rt-actual-schd
-- Grain: local date x hour ending x interface.
-- Primary key: local_date, local_hour_ending, interface_name.
-- Freshness field: local_date.
---------------------------

SELECT
    local_date
    ,local_hour_ending
    ,interface_name
    ,actual_interchange
    ,purchases
    ,sales
FROM "{{ target.database }}"."isone"."rt_hrl_scheduled_interchange"
WHERE local_date >= (CURRENT_DATE - INTERVAL '7 years')
