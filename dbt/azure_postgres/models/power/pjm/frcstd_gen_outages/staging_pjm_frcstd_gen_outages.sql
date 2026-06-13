{{
  config(
    materialized='ephemeral'
  )
}}

---------------------------
-- PJM Forecasted Generation Outages.
-- Grain: source contract from pjm.frcstd_gen_outages; primary key forecast_execution_date_ept, forecast_date.
---------------------------

SELECT
    forecast_date
    ,forecast_execution_date_ept
    ,forecast_gen_outage_mw_other
    ,forecast_gen_outage_mw_rto
    ,forecast_gen_outage_mw_west
FROM {{ ref('source_pjm_frcstd_gen_outages') }}
