{{
  config(
    materialized='ephemeral'
  )
}}

---------------------------
-- ERCOT Real-Time Price Adders by SCED Interval.
-- Grain: source contract from ercot.rt_price_adders_sced; primary key scedtimestamp, repeathourflag.
---------------------------

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
FROM "{{ target.database }}"."ercot"."rt_price_adders_sced"
WHERE
    scedtimestamp >= '2014-01-01'::timestamp
