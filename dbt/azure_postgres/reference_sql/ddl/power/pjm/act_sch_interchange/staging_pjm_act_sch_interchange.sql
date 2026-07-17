{{
  config(
    materialized='ephemeral'
  )
}}

---------------------------
-- PJM Actual/Schedule Summary Report.
-- Grain: source contract from pjm.act_sch_interchange; primary key datetime_beginning_utc, tie_line.
---------------------------

SELECT
    actual_flow
    ,datetime_beginning_ept
    ,datetime_beginning_utc
    ,datetime_ending_ept
    ,datetime_ending_utc
    ,inadv_flow
    ,sched_flow
    ,tie_line
FROM {{ ref('source_pjm_act_sch_interchange') }}
