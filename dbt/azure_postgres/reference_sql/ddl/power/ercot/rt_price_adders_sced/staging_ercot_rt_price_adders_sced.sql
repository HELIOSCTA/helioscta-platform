{{
  config(
    materialized='ephemeral'
  )
}}

SELECT
    scedtimestamp
    ,repeathourflag
    ,systemlambda
    ,rtrdpa
    ,rtrdparus
    ,rtrdpards
    ,rtrdparrs
    ,rtrdpaecrs
    ,rtrdpanss
    ,rtrruc
    ,rtrrmr
    ,rtdnclr
    ,rtders
    ,rtdctieimport
    ,rtdctieexport
    ,rtbltimport
    ,rtbltexport
    ,rtollsl
    ,rtolhsl
FROM {{ ref('source_ercot_rt_price_adders_sced') }}
