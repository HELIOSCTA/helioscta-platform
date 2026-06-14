{{
  config(
    materialized='ephemeral'
  )
}}

---------------------------
-- ISO-NE DA hourly LMPs from ISO Express CSV reports.
-- Source: https://www.iso-ne.com/isoexpress/web/reports/pricing/-/tree/lmps-da-hourly
-- Grain: date x hour ending x location.
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
FROM "{{ target.database }}"."isone"."da_hrl_lmps"
WHERE
    date >= (CURRENT_DATE - INTERVAL '7 years')
