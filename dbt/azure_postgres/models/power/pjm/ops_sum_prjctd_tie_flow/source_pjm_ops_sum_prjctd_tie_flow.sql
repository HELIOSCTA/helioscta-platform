{{
  config(
    materialized='ephemeral'
  )
}}

---------------------------
-- PJM Operations Summary projected scheduled tie flow.
-- Grain: projected peak UTC x generated_at_ept x interface.
---------------------------

SELECT
    generated_at_ept
    ,interface
    ,projected_peak_datetime_ept
    ,projected_peak_datetime_utc
    ,scheduled_tie_flow
FROM "{{ target.database }}"."pjm"."ops_sum_prjctd_tie_flow"
WHERE
    projected_peak_datetime_ept >= '2011-01-01'::timestamp
