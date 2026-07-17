{{
  config(
    materialized='ephemeral'
  )
}}

---------------------------
-- ERCOT RT Settlement Point Prices normalized from ERCOT Public Reports.
-- Grain: source contract from ercot.settlement_point_prices; primary key deliverydate, deliveryhour, deliveryinterval, settlementpoint.
---------------------------

SELECT
    deliverydate
    ,deliveryhour
    ,deliveryinterval
    ,settlementpoint
    ,settlementpointtype
    ,settlementpointprice
FROM "{{ target.database }}"."ercot"."settlement_point_prices"
WHERE
    deliverydate >= '2010-11-30'::date
