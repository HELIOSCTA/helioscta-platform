{{
  config(
    materialized='ephemeral'
  )
}}

---------------------------
-- ERCOT real-time 15-minute settlement point prices.
-- Grain: delivery date x delivery hour x delivery interval x settlement point.
---------------------------

SELECT
    deliverydate AS date
    ,deliveryhour AS hour_ending
    ,deliveryinterval AS interval_number
    ,(
        deliverydate::timestamp
        + ((deliveryhour - 1) * INTERVAL '1 hour')
        + ((deliveryinterval - 1) * INTERVAL '15 minutes')
    ) AS interval_start_local
    ,settlementpoint AS settlement_point
    ,settlementpointtype AS settlement_point_type
    ,settlementpointprice AS rt_spp
FROM {{ ref('source_ercot_settlement_point_prices') }}

