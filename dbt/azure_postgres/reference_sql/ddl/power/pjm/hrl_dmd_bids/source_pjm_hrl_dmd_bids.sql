{{
  config(
    materialized='ephemeral'
  )
}}

---------------------------
-- PJM Hourly Demand Bid Data normalized from PJM Data Miner 2.
-- Grain: source contract from pjm.hrl_dmd_bids; primary key datetime_beginning_utc, datetime_beginning_ept, area.
---------------------------

SELECT
    datetime_beginning_ept
    ,datetime_beginning_utc
    ,hrly_da_demand_bid
    ,area
FROM "{{ target.database }}"."pjm"."hrl_dmd_bids"
WHERE
    datetime_beginning_ept >= '2014-01-01'::timestamp
