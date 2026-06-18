SELECT
    station_id || '|' || observation_time_utc::text AS key_value,
    COUNT(*) AS row_count
FROM "{{ target.database }}"."weather"."noaa_metar_observations"
GROUP BY 1
HAVING COUNT(*) > 1
