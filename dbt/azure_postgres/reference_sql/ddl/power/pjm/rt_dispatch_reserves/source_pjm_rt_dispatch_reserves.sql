{{
  config(
    materialized='ephemeral'
  )
}}

---------------------------
-- PJM Real-Time Dispatched Reserves normalized from PJM Data Miner 2.
-- Grain: source contract from pjm.rt_dispatch_reserves; primary key mkt_day, datetime_beginning_utc, datetime_beginning_ept, area, reserve_type.
---------------------------

SELECT
    area
    ,datetime_beginning_ept
    ,datetime_beginning_utc
    ,deficit_mw
    ,extended_reqmt_mw
    ,mkt_day
    ,reliability_reqmt_mw
    ,reserve_reqmt_mw
    ,reserve_type
    ,total_reserve_mw
    ,additional_extended_reqmt_mw
FROM "{{ target.database }}"."pjm"."rt_dispatch_reserves"
WHERE
    datetime_beginning_ept >= '2014-01-01'::timestamp
