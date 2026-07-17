{{
  config(
    materialized='ephemeral'
  )
}}

---------------------------
-- PJM Real-Time Marginal Value.
-- Grain: source contract from pjm.rt_marginal_value; primary key datetime_beginning_utc, monitored_facility, contingency_facility.
---------------------------

SELECT
    contingency_facility
    ,datetime_beginning_ept
    ,datetime_beginning_utc
    ,datetime_ending_ept
    ,datetime_ending_utc
    ,monitored_facility
    ,shadow_price
    ,limit_control_percentage
    ,transmission_constraint_penalty_factor
FROM {{ ref('source_pjm_rt_marginal_value') }}
