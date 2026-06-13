{{
  config(
    materialized='ephemeral'
  )
}}

---------------------------
-- PJM Real-Time Short-Term Marginal Value Override normalized from PJM Data Miner 2.
-- Grain: source contract from pjm.rt_short_term_mv_override; primary key constraint_name, contingency_description, effective_datetime_utc.
---------------------------

SELECT
    constraint_name
    ,contingency_description
    ,effective_datetime_ept
    ,effective_datetime_utc
    ,posted_day
    ,short_term_transmission_constraint_penalty_factor
    ,terminate_datetime_ept
    ,terminate_datetime_utc
FROM "{{ target.database }}"."pjm"."rt_short_term_mv_override"
WHERE
    posted_day >= '2014-01-01'::date
