{{
  config(
    materialized='ephemeral'
  )
}}

---------------------------
-- PJM Hourly Load: Metered.
-- Grain: source contract from pjm.hrl_load_metered; primary key datetime_beginning_utc, nerc_region, mkt_region, zone, load_area, is_verified.
---------------------------

SELECT
    datetime_beginning_ept
    ,datetime_beginning_utc
    ,is_verified
    ,load_area
    ,mkt_region
    ,mw
    ,nerc_region
    ,zone
FROM {{ ref('source_pjm_hrl_load_metered') }}
