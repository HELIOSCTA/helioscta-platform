SELECT
    content_id,
    update_id,
    forecast_period_start,
    COUNT(*) AS duplicate_count
FROM meteologica.pjm_forecast_hourly
GROUP BY
    content_id,
    update_id,
    forecast_period_start
HAVING COUNT(*) > 1

