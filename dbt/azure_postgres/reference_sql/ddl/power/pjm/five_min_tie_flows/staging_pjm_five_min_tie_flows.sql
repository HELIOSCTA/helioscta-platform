{{
  config(
    materialized='ephemeral'
  )
}}

----------------------------------
-- PJM five-minute tie flows.
-- Grain: 1 row per five-minute interval x tie flow.
----------------------------------

SELECT
    date
    ,interval_beginning_ept
    ,interval_beginning_utc
    ,interval_ending_ept
    ,interval_ending_utc
    ,tie_flow_name
    ,actual_mw
    ,scheduled_mw
FROM {{ ref('source_pjm_five_min_tie_flows') }}
