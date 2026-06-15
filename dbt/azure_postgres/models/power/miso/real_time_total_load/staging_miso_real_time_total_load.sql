WITH source AS (
    SELECT *
    FROM {{ ref('source_miso_real_time_total_load') }}
)

SELECT
    operating_date,
    series,
    period_label,
    hour_ending,
    interval_start,
    load_mw,
    source_ref_id,
    source_interval_start,
    updated_at
FROM source
WHERE load_mw IS NOT NULL
