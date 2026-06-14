SELECT
    forecast_execution_date
    ,date
    ,COUNT(*) AS duplicate_count
FROM {{ ref('src_isone_7d_capacity') }}
GROUP BY forecast_execution_date, date
HAVING COUNT(*) > 1
