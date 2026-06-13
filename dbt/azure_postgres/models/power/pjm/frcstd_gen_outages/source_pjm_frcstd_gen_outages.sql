{{
  config(
    materialized='ephemeral'
  )
}}

---------------------------
-- PJM Forecasted Generation Outages normalized from PJM Data Miner 2.
-- Grain: source contract from pjm.frcstd_gen_outages; primary key forecast_execution_date_ept, forecast_date.
---------------------------

SELECT
    forecast_date
    ,forecast_execution_date_ept
    ,forecast_gen_outage_mw_other
    ,forecast_gen_outage_mw_rto
    ,forecast_gen_outage_mw_west
FROM "{{ target.database }}"."pjm"."frcstd_gen_outages"
WHERE
    forecast_execution_date_ept >= '2014-01-01'::date
