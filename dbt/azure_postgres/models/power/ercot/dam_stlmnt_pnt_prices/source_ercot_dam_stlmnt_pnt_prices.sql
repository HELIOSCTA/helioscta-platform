{{
  config(
    materialized='ephemeral'
  )
}}

---------------------------
-- ERCOT DAM Settlement Point Prices normalized from ERCOT Public Reports.
-- Grain: source contract from ercot.dam_stlmnt_pnt_prices; primary key deliverydate, hourending, settlementpoint.
---------------------------

SELECT
    deliverydate
    ,hourending
    ,settlementpoint
    ,settlementpointprice
FROM "{{ target.database }}"."ercot"."dam_stlmnt_pnt_prices"
WHERE
    deliverydate >= '2010-11-29'::date

