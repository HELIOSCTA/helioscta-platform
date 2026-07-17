{{
  config(
    materialized='ephemeral'
  )
}}

---------------------------
-- PJM Five Minute Solar Generation.
-- Grain: source contract from pjm.five_min_solar_generation; primary key datetime_beginning_utc.
---------------------------

SELECT
    datetime_beginning_ept
    ,datetime_beginning_utc
    ,solar_generation_mw
FROM {{ ref('source_pjm_five_min_solar_generation') }}
