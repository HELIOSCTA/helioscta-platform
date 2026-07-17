{{
  config(
    materialized='ephemeral'
  )
}}

---------------------------
-- PJM Actual/Schedule Summary Report normalized from PJM Data Miner 2.
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
FROM "{{ target.database }}"."pjm"."act_sch_interchange"
WHERE
    datetime_beginning_ept >= '2014-01-01'::timestamp
