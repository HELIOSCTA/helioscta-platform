{{
  config(
    materialized='ephemeral'
  )
}}

---------------------------
-- PJM Real-Time Dispatched Reserves.
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
FROM {{ ref('source_pjm_rt_dispatch_reserves') }}
