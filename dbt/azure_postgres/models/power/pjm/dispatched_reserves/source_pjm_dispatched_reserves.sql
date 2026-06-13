{{
  config(
    materialized='ephemeral'
  )
}}

---------------------------
-- PJM Dispatched Reserves normalized from PJM Data Miner 2.
-- Grain: source contract from pjm.dispatched_reserves; primary key datetime_beginning_utc, datetime_beginning_ept, area, reserve_type.
---------------------------

SELECT
    area
    ,datetime_beginning_ept
    ,datetime_beginning_utc
    ,market_clearing_price
    ,reliability_requirement
    ,reserve_quantity
    ,reserve_requirement
    ,reserve_type
    ,shortage_indicator
    ,extended_requirement
    ,mw_adjustment
FROM "{{ target.database }}"."pjm"."dispatched_reserves"
WHERE
    datetime_beginning_ept >= '2014-01-01'::timestamp
