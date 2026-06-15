WITH source AS (
    SELECT
        operating_date,
        series,
        period_label,
        hour_ending,
        interval_start,
        load_mw,
        source_ref_id,
        source_interval_start,
        created_at,
        updated_at
    FROM miso.real_time_total_load
)

SELECT *
FROM source
