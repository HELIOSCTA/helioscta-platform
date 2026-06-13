{{
  config(
    materialized='ephemeral'
  )
}}

---------------------------
-- PJM Generation Outage for Seven Days by Type normalized from PJM Data Miner 2.
-- Grain: source contract from pjm.gen_outages_by_type; primary key forecast_execution_date_ept, forecast_date, region.
---------------------------

SELECT
    forced_outages_mw
    ,forecast_date
    ,forecast_execution_date_ept
    ,maintenance_outages_mw
    ,planned_outages_mw
    ,region
    ,total_outages_mw
FROM "{{ target.database }}"."pjm"."gen_outages_by_type"
WHERE
    forecast_execution_date_ept >= '2014-01-01'::date
