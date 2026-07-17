{{
  config(
    materialized='ephemeral'
  )
}}

---------------------------
-- ERCOT SCED Shadow Prices normalized from ERCOT Public Reports.
-- Grain: source contract from ercot.sced_shadow_prices; primary key scedtimestamp, constraintid, constraintname, contingencyname.
---------------------------

SELECT
    scedtimestamp
    ,repeatedhourflag
    ,constraintid
    ,constraintname
    ,contingencyname
    ,shadowprice
    ,maxshadowprice
    ,"limit"
    ,"value"
    ,violatedmw
    ,fromstation
    ,tostation
    ,fromstationkv
    ,tostationkv
    ,cctstatus
FROM "{{ target.database }}"."ercot"."sced_shadow_prices"
WHERE
    scedtimestamp >= '2010-01-01'::timestamp
