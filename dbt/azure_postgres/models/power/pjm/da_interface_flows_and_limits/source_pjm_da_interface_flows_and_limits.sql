{{
  config(
    materialized='ephemeral'
  )
}}

---------------------------
-- PJM Day Ahead Interface Flows and Limits normalized from PJM Data Miner 2.
-- Grain: source contract from pjm.da_interface_flows_and_limits; primary key datetime_beginning_utc, interface_limit_name.
---------------------------

SELECT
    datetime_beginning_ept
    ,datetime_beginning_utc
    ,flow_mw
    ,interface_limit_name
    ,limit_mw
FROM "{{ target.database }}"."pjm"."da_interface_flows_and_limits"
WHERE
    datetime_beginning_ept >= '2014-01-01'::timestamp
