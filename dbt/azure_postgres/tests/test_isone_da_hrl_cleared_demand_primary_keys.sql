SELECT
    date
    ,hour_ending
    ,COUNT(*) AS duplicate_count
FROM {{ ref('source_isone_da_hrl_cleared_demand') }}
GROUP BY date, hour_ending
HAVING COUNT(*) > 1
