WITH candidates AS (
    SELECT
        *,
        ROW_NUMBER() OVER (
            PARTITION BY forecast_area, metric, forecast_period_start
            ORDER BY issue_date DESC NULLS LAST, update_id DESC
        ) AS cutoff_rank
    FROM {{ ref('staging_meteologica_pjm_forecast_hourly') }}
    WHERE issue_date IS NOT NULL
      AND issue_date < (
          forecast_period_start::date::timestamp
          - INTERVAL '13 hours'
      )
)

SELECT
    content_id,
    content_name,
    update_id,
    issue_date,
    metric,
    region,
    forecast_area,
    forecast_period_start,
    forecast_period_end,
    forecast_date,
    he_start,
    hour_ending,
    forecast_mw,
    perc10_mw,
    perc90_mw,
    updated_at
FROM candidates
WHERE cutoff_rank = 1
