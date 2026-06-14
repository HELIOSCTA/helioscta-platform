SELECT
    local_date
    ,local_hour_ending
    ,interface_name
    ,COUNT(*) AS duplicate_count
FROM {{ ref('source_isone_rt_hrl_scheduled_interchange') }}
GROUP BY local_date, local_hour_ending, interface_name
HAVING COUNT(*) > 1
