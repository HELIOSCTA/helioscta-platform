WITH staged AS (
    SELECT *
    FROM {{ ref('staging_meteologica_pjm_forecast_hourly') }}
),

with_previous AS (
    SELECT
        *,
        LAG(forecast_mw) OVER (
            PARTITION BY forecast_area, metric, forecast_period_start
            ORDER BY issue_date, update_id
        ) AS previous_forecast_mw,
        LAG(issue_date) OVER (
            PARTITION BY forecast_area, metric, forecast_period_start
            ORDER BY issue_date, update_id
        ) AS previous_issue_date,
        LAG(update_id) OVER (
            PARTITION BY forecast_area, metric, forecast_period_start
            ORDER BY issue_date, update_id
        ) AS previous_update_id
    FROM staged
)

SELECT
    content_id,
    content_name,
    update_id,
    issue_date,
    previous_update_id,
    previous_issue_date,
    metric,
    region,
    forecast_area,
    forecast_period_start,
    forecast_period_end,
    forecast_date,
    he_start,
    hour_ending,
    forecast_mw,
    previous_forecast_mw,
    CASE
        WHEN forecast_mw IS NULL OR previous_forecast_mw IS NULL THEN NULL
        ELSE forecast_mw - previous_forecast_mw
    END AS forecast_mw_change,
    updated_at
FROM with_previous
