{{
  config(
    materialized='ephemeral'
  )
}}

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
FROM {{ ref('source_ercot_dam_shadow_prices') }}
