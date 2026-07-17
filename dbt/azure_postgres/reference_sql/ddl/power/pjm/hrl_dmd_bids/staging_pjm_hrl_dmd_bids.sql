{{
  config(
    materialized='ephemeral'
  )
}}

---------------------------
-- PJM Hourly Demand Bid Data.
-- Grain: source contract from pjm.hrl_dmd_bids; primary key datetime_beginning_utc, datetime_beginning_ept, area.
---------------------------

SELECT
    datetime_beginning_ept
    ,datetime_beginning_utc
    ,hrly_da_demand_bid
    ,area
FROM {{ ref('source_pjm_hrl_dmd_bids') }}
