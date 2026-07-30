-- Read-only verification SQL for eia.nat_gas_consumption_end_use_monthly.

SELECT
    COUNT(*) AS row_count,
    MIN(report_month) AS min_report_month,
    MAX(report_month) AS max_report_month,
    MAX(scrape_run_at_utc) AS max_scrape_run_at_utc,
    COUNT(DISTINCT series) AS series_count,
    COUNT(DISTINCT duoarea) AS area_count,
    COUNT(DISTINCT process) AS process_count
FROM eia.nat_gas_consumption_end_use_monthly;

SELECT
    report_month,
    series,
    COUNT(*) AS row_count
FROM eia.nat_gas_consumption_end_use_monthly
GROUP BY report_month, series
HAVING COUNT(*) > 1
ORDER BY row_count DESC, report_month DESC
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
  AND pipeline_name = 'nat_gas_consumption_end_use_monthly'
ORDER BY created_at DESC
LIMIT 20;
