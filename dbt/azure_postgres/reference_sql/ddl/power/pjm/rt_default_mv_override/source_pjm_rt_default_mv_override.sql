{{
  config(
    materialized='ephemeral'
  )
}}

---------------------------
-- PJM Real-Time Default Marginal Value Override normalized from PJM Data Miner 2.
-- Grain: source contract from pjm.rt_default_mv_override; primary key constraint_name, contingency_description, effective_day.
---------------------------

SELECT
    constraint_name
    ,contingency_description
    ,default_transmission_constraint_penalty_factor
    ,effective_day
    ,posted_day
    ,terminate_day
FROM "{{ target.database }}"."pjm"."rt_default_mv_override"
WHERE
    posted_day >= '2014-01-01'::date
