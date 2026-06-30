{{
  config(
    materialized='ephemeral'
  )
}}

---------------------------
-- PJM Scheduled Generation.
-- Grain: source contract from pjm.rt_and_self_ecomax; primary key datetime_beginning_utc.
---------------------------

SELECT
    datetime_beginning_utc
    ,datetime_beginning_ept
    ,rt_ecomax
    ,conf_disclaimer
    ,self_ecomax
FROM {{ ref('source_pjm_rt_and_self_ecomax') }}
