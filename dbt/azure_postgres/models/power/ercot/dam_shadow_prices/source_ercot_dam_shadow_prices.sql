{{
  config(
    materialized='ephemeral'
  )
}}

---------------------------
-- ERCOT DAM Shadow Prices normalized from ERCOT Public Reports.
-- Grain: source contract from ercot.dam_shadow_prices; primary key deliverytime, constraintid, constraintname, contingencyname.
---------------------------

SELECT
    deliverydate
    ,hourending
    ,constraintid
    ,constraintname
    ,contingencyname
    ,constraintlimit
    ,constraintvalue
    ,violationamount
    ,shadowprice
    ,fromstation
    ,tostation
    ,fromstationkv
    ,tostationkv
    ,deliverytime
FROM "{{ target.database }}"."ercot"."dam_shadow_prices"
WHERE
    deliverydate >= '2010-01-01'::date
