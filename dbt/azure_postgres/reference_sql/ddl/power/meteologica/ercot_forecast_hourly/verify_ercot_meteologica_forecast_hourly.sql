-- Read-only validation SQL for ERCOT Meteologica hourly forecasts.

WITH expected_content AS (
    SELECT *
    FROM (
        VALUES
            (1840, 'solar', 'ERCOT'),
            (1877, 'wind', 'ERCOT'),
            (1943, 'load', 'ERCOT'),
            (1952, 'load', 'HOUSTON_FORECAST_ZONE'),
            (1953, 'load', 'SOUTH_FORECAST_ZONE'),
            (1954, 'load', 'NORTH_FORECAST_ZONE'),
            (1955, 'load', 'WEST_FORECAST_ZONE')
    ) AS feeds(content_id, metric, forecast_area)
),

latest_table AS (
    SELECT
        content_id,
        metric,
        forecast_area,
        COUNT(*) AS row_count,
        COUNT(DISTINCT update_id) AS update_count,
        MAX(issue_date) AS latest_issue_date,
        MIN(forecast_period_start) AS min_forecast_period_start,
        MAX(forecast_period_start) AS max_forecast_period_start,
        MAX(updated_at) AS latest_updated_at
    FROM meteologica.ercot_forecast_hourly
    GROUP BY content_id, metric, forecast_area
)

SELECT
    expected_content.content_id,
    expected_content.metric AS expected_metric,
    expected_content.forecast_area AS expected_forecast_area,
    latest_table.row_count,
    latest_table.update_count,
    latest_table.latest_issue_date,
    latest_table.min_forecast_period_start,
    latest_table.max_forecast_period_start,
    latest_table.latest_updated_at
FROM expected_content
LEFT JOIN latest_table
    ON latest_table.content_id = expected_content.content_id
    AND latest_table.metric = expected_content.metric
    AND latest_table.forecast_area = expected_content.forecast_area
ORDER BY expected_content.content_id;

SELECT
    provider,
    operation_name,
    content_id,
    feed_name,
    status,
    http_status,
    rows_returned,
    created_at
FROM ops.api_fetch_log
WHERE pipeline_name = 'ercot_meteologica_forecast_hourly'
ORDER BY created_at DESC
LIMIT 20;

SELECT
    dataset,
    event_key,
    business_date,
    row_count,
    entity_count,
    period_count,
    completeness_status,
    created_at,
    payload
FROM ops.data_availability_events
WHERE dataset = 'ercot_meteologica_forecast_hourly'
ORDER BY created_at DESC
LIMIT 20;
