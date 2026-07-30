-- Read-only verification SQL for eia.weekly_underground_storage.

SELECT
    COUNT(*) AS row_count,
    MIN(eia_week_ending) AS min_eia_week_ending,
    MAX(eia_week_ending) AS max_eia_week_ending,
    MAX(scrape_run_at_utc) AS max_scrape_run_at_utc,
    COUNT(DISTINCT series) AS series_count,
    COUNT(DISTINCT region) AS region_count
FROM eia.weekly_underground_storage;

SELECT
    eia_week_ending,
    series,
    COUNT(*) AS row_count
FROM eia.weekly_underground_storage
GROUP BY eia_week_ending, series
HAVING COUNT(*) > 1
ORDER BY row_count DESC, eia_week_ending DESC
LIMIT 50;

SELECT
    created_at,
    provider,
    pipeline_name,
    operation_name,
    target_table,
    status,
    http_status,
    rows_returned,
    metadata
FROM ops.api_fetch_log
WHERE provider = 'eia'
  AND pipeline_name = 'weekly_underground_storage'
ORDER BY created_at DESC
LIMIT 20;
