SELECT
    date
    ,hour_ending
    ,COUNT(*) AS duplicate_count
FROM {{ ref('source_isone_hourly_system_demand') }}
GROUP BY date, hour_ending
HAVING COUNT(*) > 1
