{{
  config(
    materialized='ephemeral'
  )
}}

---------------------------
-- ISO-NE final RT hourly LMPs from ISO Express CSV reports.
-- Source: https://www.iso-ne.com/isoexpress/web/reports/pricing/-/tree/lmps-rt-hourly-final
-- Grain: date x hour ending x ISO-NE internal hub.
-- Primary key: date, hour_ending, location_id, location_name, location_type.
-- Freshness field: date.
---------------------------

SELECT
    date
    ,hour_ending
    ,location_id
    ,location_name
    ,location_type
    ,locational_marginal_price
    ,energy_component
    ,congestion_component
    ,marginal_loss_component
FROM "{{ target.database }}"."isone"."rt_hrl_lmps_final"
WHERE
    date >= (CURRENT_DATE - INTERVAL '7 years')
    AND location_id = 4000
    AND location_name = '.H.INTERNAL_HUB'
    AND location_type = 'HUB'
