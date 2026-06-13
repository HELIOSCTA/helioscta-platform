{{
  config(
    materialized='ephemeral'
  )
}}

---------------------------
-- PJM Day-Ahead Marginal Value normalized from PJM Data Miner 2.
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
FROM "{{ target.database }}"."pjm"."da_marginal_value"
WHERE
    datetime_beginning_ept >= '2014-01-01'::timestamp
