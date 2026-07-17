{{
  config(
    materialized='ephemeral'
  )
}}

---------------------------
-- PJM Operations Summary projected scheduled tie flow.
-- Grain: projected peak UTC x interface.
---------------------------

SELECT
    generated_at_ept
    ,interface
    ,projected_peak_datetime_ept
    ,projected_peak_datetime_utc
    ,scheduled_tie_flow
FROM {{ ref('source_pjm_ops_sum_prjctd_tie_flow') }}
