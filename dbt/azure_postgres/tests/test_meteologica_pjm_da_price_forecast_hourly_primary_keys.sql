SELECT
    content_id,
    update_id,
    forecast_period_start,
    COUNT(*) AS duplicate_count
FROM meteologica.usa_pjm_western_hub_da_power_price_forecast_hourly
GROUP BY
    content_id,
    update_id,
    forecast_period_start
HAVING COUNT(*) > 1
