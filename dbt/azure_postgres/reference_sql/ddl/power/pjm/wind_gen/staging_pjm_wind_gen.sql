{{
  config(
    materialized='ephemeral'
  )
}}

---------------------------
-- PJM Wind Generation.
-- Grain: source contract from pjm.wind_gen; primary key datetime_beginning_utc, area.
---------------------------

SELECT
    area
    ,datetime_beginning_ept
    ,datetime_beginning_utc
    ,wind_generation_mw
FROM {{ ref('source_pjm_wind_gen') }}
