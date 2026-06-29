{{
  config(
    materialized='ephemeral'
  )
}}

---------------------------
-- PJM Operations Summary forecast transfer limits.
-- Grain: projected peak UTC x transfer limit name.
---------------------------

SELECT
    generated_at_ept
    ,projected_peak_datetime_ept
    ,projected_peak_datetime_utc
    ,transfer_limit_name
    ,transfer_limit_mw
FROM {{ ref('source_pjm_ops_sum_frcstd_tran_lim') }}
