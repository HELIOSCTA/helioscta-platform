{{
  config(
    materialized='ephemeral'
  )
}}

---------------------------
-- ERCOT Real-Time Price Adders for 15-Minute Settlement Interval.
-- Grain: source contract from ercot.rt_price_adders_15min; primary key deliverydate, deliveryhour, deliveryinterval, repeathourflag.
---------------------------

SELECT
    deliverydate
    ,deliveryhour
    ,deliveryinterval
    ,rtrdpa
    ,rtrdpru
    ,rtrdprd
    ,rtrdprrs
    ,rtrdpecrs
    ,rtrdpns
    ,repeathourflag
FROM "{{ target.database }}"."ercot"."rt_price_adders_15min"
WHERE
    deliverydate >= '2014-01-01'::date
