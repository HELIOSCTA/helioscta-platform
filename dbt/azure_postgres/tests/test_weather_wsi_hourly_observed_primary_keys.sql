SELECT
    station_id || '|' || observation_time_local::text || '|' || region AS key_value,
    COUNT(*) AS row_count
FROM "{{ target.database }}"."weather"."wsi_hourly_observed_temperatures"
GROUP BY 1
HAVING COUNT(*) > 1
