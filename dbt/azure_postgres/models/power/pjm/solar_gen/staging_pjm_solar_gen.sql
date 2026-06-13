{{
  config(
    materialized='ephemeral'
  )
}}

---------------------------
-- PJM Solar Generation.
-- Grain: source contract from pjm.solar_gen; primary key datetime_beginning_utc, area.
---------------------------

SELECT
    area
    ,datetime_beginning_ept
    ,datetime_beginning_utc
    ,solar_generation_mw
FROM {{ ref('source_pjm_solar_gen') }}
