SELECT
    forecast_execution_date
    ,forecast_date
    ,hour_ending
    ,COUNT(*) AS duplicate_count
FROM {{ ref('src_isone_7d_solar') }}
GROUP BY forecast_execution_date, forecast_date, hour_ending
HAVING COUNT(*) > 1
