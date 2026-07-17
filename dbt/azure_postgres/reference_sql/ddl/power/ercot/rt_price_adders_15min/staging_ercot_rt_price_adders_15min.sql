{{
  config(
    materialized='ephemeral'
  )
}}

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
FROM {{ ref('source_ercot_rt_price_adders_15min') }}
