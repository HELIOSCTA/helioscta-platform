{{
  config(
    materialized='ephemeral'
  )
}}

---------------------------
-- PJM Day-Ahead Transmission Constraints normalized from PJM Data Miner 2.
-- Grain: source contract from pjm.da_transconstraints; primary key datetime_beginning_utc, day_ahead_congestion_event, monitored_facility, contingency_facility.
---------------------------

SELECT
    contingency_facility
    ,datetime_beginning_ept
    ,datetime_beginning_utc
    ,datetime_ending_ept
    ,datetime_ending_utc
    ,day_ahead_congestion_event
    ,duration
    ,monitored_facility
FROM "{{ target.database }}"."pjm"."da_transconstraints"
WHERE
    datetime_beginning_ept >= '2014-01-01'::timestamp
