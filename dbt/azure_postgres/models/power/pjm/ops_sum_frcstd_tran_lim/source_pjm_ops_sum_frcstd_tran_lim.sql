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
FROM "{{ target.database }}"."pjm"."ops_sum_frcstd_tran_lim"
WHERE
    projected_peak_datetime_ept >= '2011-01-01'::timestamp
