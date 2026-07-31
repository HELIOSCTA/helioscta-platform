-- Read-only verification SQL for eia.eia_930_daily_region_data.

SELECT
    COUNT(*) AS row_count,
    MIN(period) AS min_period,
    MAX(period) AS max_period,
    MAX(scrape_run_at_utc) AS max_scrape_run_at_utc,
    COUNT(DISTINCT respondent) AS respondent_count,
    COUNT(DISTINCT type) AS type_count,
    COUNT(DISTINCT timezone) AS timezone_count
FROM eia.eia_930_daily_region_data;

SELECT
    period,
    respondent,
    type,
    timezone,
    COUNT(*) AS row_count
FROM eia.eia_930_daily_region_data
GROUP BY period, respondent, type, timezone
HAVING COUNT(*) > 1
ORDER BY row_count DESC, period DESC
LIMIT 50;

SELECT
    period,
    respondent,
    type,
    COUNT(*) AS timezone_variant_count
FROM eia.eia_930_daily_region_data
GROUP BY period, respondent, type
HAVING COUNT(*) > 1
ORDER BY period DESC, timezone_variant_count DESC
LIMIT 50;

SELECT
    type,
    MAX(type_name) AS type_name,
    COUNT(*) AS row_count
FROM eia.eia_930_daily_region_data
GROUP BY type
ORDER BY type;

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
  AND pipeline_name = 'eia_930_daily_region_data'
ORDER BY created_at DESC
LIMIT 20;
