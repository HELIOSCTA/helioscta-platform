{{
  config(
    materialized='ephemeral'
  )
}}

---------------------------
-- ERCOT day-ahead hourly settlement point prices.
-- Grain: delivery date x hour ending x settlement point.
---------------------------

SELECT
    deliverydate AS date
    ,hourending AS hour_ending
    ,(
        deliverydate::timestamp
        + ((hourending - 1) * INTERVAL '1 hour')
    ) AS datetime_beginning_local
    ,settlementpoint AS settlement_point
    ,settlementpointprice AS da_lmp
FROM {{ ref('source_ercot_dam_stlmnt_pnt_prices') }}
