{{
  config(
    materialized='ephemeral'
  )
}}

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
FROM {{ ref('source_ercot_sced_shadow_prices') }}
