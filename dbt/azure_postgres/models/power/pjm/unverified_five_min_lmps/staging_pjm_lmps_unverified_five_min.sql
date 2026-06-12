{{
  config(
    materialized='ephemeral'
  )
}}

----------------------------------
-- PJM unverified five-minute LMPs.
-- Grain: 1 row per five-minute interval x hub.
----------------------------------

SELECT
    date
    ,interval_beginning_ept
    ,interval_beginning_utc
    ,interval_ending_ept
    ,interval_ending_utc
    ,hub
    ,pnode_type
    ,unverified_five_min_rtlmp
    ,prior_hour_lmp
FROM {{ ref('source_pjm_unverified_five_min_lmps') }}
