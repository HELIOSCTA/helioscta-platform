SELECT
    published_date
    ,forecast_date
    ,hour_ending
    ,reliability_region
    ,COUNT(*) AS duplicate_count
FROM {{ ref('src_isone_tdrdf') }}
GROUP BY published_date, forecast_date, hour_ending, reliability_region
HAVING COUNT(*) > 1
