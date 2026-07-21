# Telemetry Health Queries

Use these as read-only MCP query patterns against Azure Postgres. Keep samples
small and redact secrets if error text contains credentials.

## Schemas

`ops.api_fetch_log` key columns:

- identity/context: `id`, `app_name`, `actor_type`, `provider`,
  `pipeline_name`, `run_id`, `operation_name`, `feed_name`, `target_table`
- result: `status`, `http_status`, `elapsed_ms`, `rows_returned`,
  `rows_written`, `error_type`, `error_message`, `metadata`, `created_at`

`ops.data_availability_events` key columns:

- identity/context: `event_key`, `dataset`, `source_system`,
  `availability_type`, `business_date`, `scope`, `grain`, `source_table`
- result: `row_count`, `entity_count`, `period_count`,
  `completeness_status`, `run_id`, `payload`, `created_at`, `updated_at`

## Recent Failures

```sql
SELECT
    created_at AT TIME ZONE 'America/Denver' AS created_at_mountain,
    provider,
    pipeline_name,
    operation_name,
    feed_name,
    target_table,
    status,
    http_status,
    rows_returned,
    rows_written,
    error_type,
    left(coalesce(error_message, ''), 700) AS error_message,
    metadata
FROM ops.api_fetch_log
WHERE created_at >= now() - interval '24 hours'
  AND status NOT IN ('success', 'succeeded', 'dry_run')
ORDER BY created_at DESC
LIMIT 50;
```

## Failure Groups

```sql
SELECT
    provider,
    coalesce(pipeline_name, operation_name, feed_name, target_table, 'unknown') AS script_key,
    operation_name,
    target_table,
    status,
    error_type,
    count(*) AS failure_count,
    max(created_at) AT TIME ZONE 'America/Denver' AS latest_failure_mountain,
    left(max(error_message), 500) AS sample_error
FROM ops.api_fetch_log
WHERE created_at >= now() - interval '24 hours'
  AND status NOT IN ('success', 'succeeded', 'dry_run')
GROUP BY
    provider,
    coalesce(pipeline_name, operation_name, feed_name, target_table, 'unknown'),
    operation_name,
    target_table,
    status,
    error_type
ORDER BY latest_failure_mountain DESC, failure_count DESC
LIMIT 25;
```

## Latest Success Per Script

```sql
WITH successful AS (
    SELECT
        provider,
        coalesce(pipeline_name, operation_name, feed_name, target_table, 'unknown') AS script_key,
        operation_name,
        target_table,
        rows_written,
        rows_returned,
        created_at,
        row_number() OVER (
            PARTITION BY
                provider,
                coalesce(pipeline_name, operation_name, feed_name, target_table, 'unknown'),
                operation_name,
                target_table
            ORDER BY created_at DESC
        ) AS rn
    FROM ops.api_fetch_log
    WHERE status IN ('success', 'succeeded')
      AND created_at >= now() - interval '14 days'
)
SELECT
    provider,
    script_key,
    operation_name,
    target_table,
    created_at AT TIME ZONE 'America/Denver' AS latest_success_mountain,
    round(extract(epoch from (now() - created_at)) / 3600.0, 1) AS age_hours,
    rows_returned,
    rows_written
FROM successful
WHERE rn = 1
ORDER BY age_hours DESC
LIMIT 100;
```

## Cadence-Based Stale Candidates

This query infers cadence from recent successful telemetry. Treat results as
advisory and compare with repo scheduler docs before declaring a failure.

```sql
WITH successful AS (
    SELECT
        provider,
        coalesce(pipeline_name, operation_name, feed_name, target_table, 'unknown') AS script_key,
        operation_name,
        target_table,
        created_at,
        lag(created_at) OVER (
            PARTITION BY
                provider,
                coalesce(pipeline_name, operation_name, feed_name, target_table, 'unknown'),
                operation_name,
                target_table
            ORDER BY created_at
        ) AS previous_created_at
    FROM ops.api_fetch_log
    WHERE status IN ('success', 'succeeded')
      AND created_at >= now() - interval '14 days'
),
cadence AS (
    SELECT
        provider,
        script_key,
        operation_name,
        target_table,
        max(created_at) AS latest_success_at,
        percentile_cont(0.5) WITHIN GROUP (
            ORDER BY extract(epoch from (created_at - previous_created_at)) / 3600.0
        ) AS median_gap_hours,
        count(*) AS success_count
    FROM successful
    WHERE previous_created_at IS NOT NULL
    GROUP BY provider, script_key, operation_name, target_table
)
SELECT
    provider,
    script_key,
    operation_name,
    target_table,
    latest_success_at AT TIME ZONE 'America/Denver' AS latest_success_mountain,
    round(median_gap_hours::numeric, 1) AS median_gap_hours,
    round((extract(epoch from (now() - latest_success_at)) / 3600.0)::numeric, 1) AS age_hours,
    success_count
FROM cadence
WHERE success_count >= 3
  AND median_gap_hours IS NOT NULL
  AND extract(epoch from (now() - latest_success_at)) / 3600.0 > greatest(2 * median_gap_hours, 6)
ORDER BY age_hours DESC
LIMIT 50;
```

## Availability Events

```sql
SELECT
    dataset,
    source_system,
    availability_type,
    business_date,
    scope,
    grain,
    source_table,
    row_count,
    entity_count,
    period_count,
    completeness_status,
    created_at AT TIME ZONE 'America/Denver' AS created_at_mountain,
    updated_at AT TIME ZONE 'America/Denver' AS updated_at_mountain
FROM ops.data_availability_events
WHERE created_at >= now() - interval '7 days'
  AND completeness_status <> 'complete'
ORDER BY created_at DESC
LIMIT 50;
```

## Recent Volume Summary

```sql
SELECT
    provider,
    coalesce(pipeline_name, operation_name, feed_name, target_table, 'unknown') AS script_key,
    count(*) AS run_count,
    count(*) FILTER (WHERE status IN ('success', 'succeeded')) AS success_count,
    count(*) FILTER (WHERE status NOT IN ('success', 'succeeded', 'dry_run')) AS failure_count,
    max(created_at) AT TIME ZONE 'America/Denver' AS latest_run_mountain,
    max(created_at) FILTER (WHERE status IN ('success', 'succeeded'))
        AT TIME ZONE 'America/Denver' AS latest_success_mountain,
    sum(coalesce(rows_returned, 0)) AS rows_returned,
    sum(coalesce(rows_written, 0)) AS rows_written
FROM ops.api_fetch_log
WHERE created_at >= now() - interval '24 hours'
GROUP BY
    provider,
    coalesce(pipeline_name, operation_name, feed_name, target_table, 'unknown')
ORDER BY failure_count DESC, latest_run_mountain DESC
LIMIT 100;
```
