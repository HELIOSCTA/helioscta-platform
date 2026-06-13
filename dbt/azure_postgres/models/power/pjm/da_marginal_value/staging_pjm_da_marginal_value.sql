{{
  config(
    materialized='ephemeral'
  )
}}

---------------------------
-- PJM Day-Ahead Marginal Value.
-- Grain: source contract from pjm.da_marginal_value; primary key datetime_beginning_utc, monitored_facility, contingency_facility.
---------------------------

SELECT
    contingency_facility
    ,datetime_beginning_ept
    ,datetime_beginning_utc
    ,datetime_ending_ept
    ,datetime_ending_utc
    ,monitored_facility
    ,shadow_price
FROM {{ ref('source_pjm_da_marginal_value') }}
