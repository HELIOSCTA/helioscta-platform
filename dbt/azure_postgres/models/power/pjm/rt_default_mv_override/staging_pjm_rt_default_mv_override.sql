{{
  config(
    materialized='ephemeral'
  )
}}

---------------------------
-- PJM Real-Time Default Marginal Value Override.
-- Grain: source contract from pjm.rt_default_mv_override; primary key constraint_name, contingency_description, effective_day.
---------------------------

SELECT
    constraint_name
    ,contingency_description
    ,default_transmission_constraint_penalty_factor
    ,effective_day
    ,posted_day
    ,terminate_day
FROM {{ ref('source_pjm_rt_default_mv_override') }}
