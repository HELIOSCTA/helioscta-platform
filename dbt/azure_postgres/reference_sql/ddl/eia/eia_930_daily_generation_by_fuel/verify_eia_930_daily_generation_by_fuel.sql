-- Read-only verification SQL for eia.eia_930_daily_generation_by_fuel.

SELECT
    COUNT(*) AS row_count,
    MIN(period) AS min_period,
    MAX(period) AS max_period,
    MAX(scrape_run_at_utc) AS max_scrape_run_at_utc,
    COUNT(DISTINCT respondent) AS respondent_count,
    COUNT(DISTINCT fueltype) AS fueltype_count,
    COUNT(DISTINCT timezone) AS timezone_count
FROM eia.eia_930_daily_generation_by_fuel;

SELECT
    period,
    respondent,
    fueltype,
    timezone,
    COUNT(*) AS row_count
FROM eia.eia_930_daily_generation_by_fuel
GROUP BY period, respondent, fueltype, timezone
HAVING COUNT(*) > 1
ORDER BY row_count DESC, period DESC
LIMIT 50;

SELECT
    period,
    respondent,
    fueltype,
    COUNT(*) AS timezone_variant_count
FROM eia.eia_930_daily_generation_by_fuel
GROUP BY period, respondent, fueltype
HAVING COUNT(*) > 1
ORDER BY period DESC, timezone_variant_count DESC
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
  AND pipeline_name = 'eia_930_daily_generation_by_fuel'
ORDER BY created_at DESC
LIMIT 20;
