SELECT
    local_date
    ,local_hour_ending
    ,entity_type
    ,interface_name
    ,COUNT(*) AS duplicate_count
FROM {{ ref('source_isone_external_interface_metered_data') }}
GROUP BY local_date, local_hour_ending, entity_type, interface_name
HAVING COUNT(*) > 1
