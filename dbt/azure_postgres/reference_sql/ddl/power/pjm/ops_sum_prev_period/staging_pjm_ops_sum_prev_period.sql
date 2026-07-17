{{
  config(
    materialized='ephemeral'
  )
}}

---------------------------
-- PJM Operations Summary actual operational statistics.
-- Grain: operating hour UTC x area.
---------------------------

SELECT
    actual_load
    ,area
    ,area_load_forecast
    ,datetime_beginning_ept
    ,datetime_beginning_utc
    ,datetime_ending_ept
    ,datetime_ending_utc
    ,dispatch_rate
    ,generated_at_ept
    ,datetime_beginning_ept < '2017-05-31'::timestamp AS is_sparse_legacy_period
FROM {{ ref('source_pjm_ops_sum_prev_period') }}
