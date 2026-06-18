SELECT
    station_id || '|' || region || '|' ||
        forecast_issued_at_utc::text || '|' || forecast_time_utc::text AS key_value,
    COUNT(*) AS row_count
FROM "{{ target.database }}"."weather"."wsi_hourly_forecasts"
GROUP BY 1
HAVING COUNT(*) > 1
