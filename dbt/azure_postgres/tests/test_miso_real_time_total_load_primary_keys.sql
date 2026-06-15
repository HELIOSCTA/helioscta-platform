SELECT
    series || '|' || operating_date::text || '|' || period_label AS key_value,
    COUNT(*) AS row_count
FROM "{{ target.database }}"."miso"."real_time_total_load"
GROUP BY 1
HAVING COUNT(*) > 1
