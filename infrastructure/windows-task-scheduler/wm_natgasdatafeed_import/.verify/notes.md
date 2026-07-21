# WM NatGas DataFeed - Verification Guide

Migration status: reference-only in this repo. The live scheduled tasks still
run from the legacy `helioscta-azure-backend` checkout until an approved
cutover.

## Key Tables

### `natgas.load_status` -- Import Tracking

One row per file imported. Primary table for verifying successful runs.

| Column | What it tells you |
|--------|-------------------|
| `source_id` | Which source type (maps to `natgas.source`) |
| `processed` | 0 = pending, 1 = complete |
| `insert_date` | When the file was first loaded |
| `update_date` | Last update timestamp |
| `row_count` | Rows loaded from this file |
| `name_full` | Original filename |

### `administration.error_log` -- SQL Errors

Any SQL errors captured during import with timestamps, procedure, severity, and message.

### `natgas.source` -- Source Registry

33 entries defining API paths, load types, and stored procedures. Maps
`source_id` to source type.

`delta` is a scheduler mode, not a value stored in `natgas.source.source_type`.
The import script maps `-sourceType delta` to `source_type = 'hourly' AND
load_type = 'incremental'`.

---

## Source ID Reference

| source_id | source_type | Notes |
|-----------|-------------|-------|
| 1 | metadata | Reference tables (locations, pipelines, plants, cycles) |
| 17-21 | hourly / incremental | Core data tables loaded by the `delta` task mode (gas_burn, no_notice, nominations, gas_quality, all_cycles) |
| 22 | hourly / single | pipeline_inventory |
| 32 | hourly / single | index_of_customers |
| 33 | hourly / multi-file | gas_production_forecast, daily_pipe_production |
| 7-11 | daily | **Dead** -- no longer active |
| 12-16 | bidaily | **Dead** -- no longer active |
| 23 | metadata | proprietary_metadata (deleted/disabled) |
| 24-31 | hourly | Proprietary: intrastate_storage, mexico_exports, lng, lng_shipping, state-level storage |

---

## Quick Health Check (run after any import)

### 1. Any errors today?

```sql
SELECT error_date, error_procedure, error_message
FROM administration.error_log
WHERE CAST(error_date AS DATE) >= CAST(GETUTCDATE() AT TIME ZONE 'UTC' AT TIME ZONE 'Mountain Standard Time' AS DATE)
ORDER BY error_date DESC;
```

### 2. What loaded today? (by source type)

```sql
SELECT
    s.source_type,
    s.source_name,
    ls.source_id,
    COUNT(*) AS files_loaded,
    SUM(ls.row_count) AS total_rows,
    MAX(ls.update_date AT TIME ZONE 'UTC' AT TIME ZONE 'Mountain Standard Time') AS last_update_mst
FROM natgas.load_status ls
JOIN natgas.source s ON ls.source_id = s.source_id
WHERE CAST(ls.update_date AS DATE) >= CAST(GETUTCDATE() AT TIME ZONE 'UTC' AT TIME ZONE 'Mountain Standard Time' AS DATE)
GROUP BY s.source_type, s.source_name, ls.source_id
ORDER BY s.source_type, s.source_name;
```

---

## Verify by Source Type

### Metadata (runs hourly at :05 and :10)

Expect rows in all reference tables:

```sql
SELECT 'location_extended' AS tbl, COUNT(*) AS cnt FROM natgas.location_extended
UNION ALL SELECT 'location_role', COUNT(*) FROM natgas.location_role
UNION ALL SELECT 'pipelines', COUNT(*) FROM natgas.pipelines
UNION ALL SELECT 'plants', COUNT(*) FROM natgas.plants
UNION ALL SELECT 'nomination_cycles', COUNT(*) FROM natgas.nomination_cycles
UNION ALL SELECT 'scheduling_cycles', COUNT(*) FROM natgas.scheduling_cycles
UNION ALL SELECT 'pipeline_scheduling', COUNT(*) FROM natgas.pipeline_scheduling;
```

### Delta task mode (runs hourly at :20, :30, and :40)

Check that today's data has landed in core tables:

```sql
SELECT 'nominations' AS tbl, MAX(gas_day) AS latest_gas_day, COUNT(*) AS rows_today
FROM natgas.nominations WHERE gas_day >= CAST(GETDATE() AS DATE)
UNION ALL
SELECT 'no_notice', MAX(gas_day), COUNT(*)
FROM natgas.no_notice WHERE gas_day >= CAST(GETDATE() AS DATE)
UNION ALL
SELECT 'gas_burn', MAX(CAST(flow_timestamp_central AS DATE)), COUNT(*)
FROM natgas.gas_burn WHERE CAST(flow_timestamp_central AS DATE) >= CAST(GETDATE() AS DATE)
UNION ALL
SELECT 'gas_quality', MAX(gas_day), COUNT(*)
FROM natgas.gas_quality WHERE gas_day >= CAST(GETDATE() AS DATE)
UNION ALL
SELECT 'all_cycles', MAX(gas_day), COUNT(*)
FROM natgas.all_cycles WHERE gas_day >= CAST(GETDATE() AS DATE);
```

### Baseline (manual -- verify historical depth)

Row counts by year for each core table:

```sql
SELECT 'gas_burn' AS tbl, YEAR(flow_timestamp_central) AS yr, COUNT(*) AS cnt
FROM natgas.gas_burn GROUP BY YEAR(flow_timestamp_central)
UNION ALL
SELECT 'nominations', YEAR(gas_day), COUNT(*)
FROM natgas.nominations GROUP BY YEAR(gas_day)
UNION ALL
SELECT 'no_notice', YEAR(gas_day), COUNT(*)
FROM natgas.no_notice GROUP BY YEAR(gas_day)
UNION ALL
SELECT 'gas_quality', YEAR(gas_day), COUNT(*)
FROM natgas.gas_quality GROUP BY YEAR(gas_day)
UNION ALL
SELECT 'all_cycles', YEAR(gas_day), COUNT(*)
FROM natgas.all_cycles GROUP BY YEAR(gas_day)
ORDER BY tbl, yr;
```

---

## Detect Gaps

Check whether the last delta task-mode run landed incremental hourly data in
the past 90 minutes:

```sql
SELECT
    s.source_name,
    s.load_type,
    COUNT(*) AS loads,
    SUM(ls.row_count) AS total_rows,
    MAX(ls.update_date AT TIME ZONE 'UTC' AT TIME ZONE 'Mountain Standard Time') AS last_update_mst
FROM natgas.load_status ls
JOIN natgas.source s ON ls.source_id = s.source_id
WHERE ls.update_date >= DATEADD(MINUTE, -90, GETUTCDATE())
  AND s.source_type = 'hourly'
  AND s.load_type = 'incremental'
GROUP BY s.source_name, s.load_type
ORDER BY s.source_name;
```

If this returns no rows for an expected source, the recent scheduled delta
task-mode runs did not load that source.

Check whether the last hourly task-mode run landed non-incremental hourly data
in the past three hours:

```sql
SELECT
    s.source_name,
    s.load_type,
    COUNT(*) AS loads,
    SUM(ls.row_count) AS total_rows,
    MAX(ls.update_date AT TIME ZONE 'UTC' AT TIME ZONE 'Mountain Standard Time') AS last_update_mst
FROM natgas.load_status ls
JOIN natgas.source s ON ls.source_id = s.source_id
WHERE ls.update_date >= DATEADD(HOUR, -3, GETUTCDATE())
  AND s.source_type = 'hourly'
  AND s.load_type != 'incremental'
GROUP BY s.source_name, s.load_type
ORDER BY s.source_name;
```

Check whether the last metadata run landed data in the past hour:

```sql
SELECT
    s.source_name,
    COUNT(*) AS loads,
    SUM(ls.row_count) AS total_rows,
    MAX(ls.update_date AT TIME ZONE 'UTC' AT TIME ZONE 'Mountain Standard Time') AS last_update_mst
FROM natgas.load_status ls
JOIN natgas.source s ON ls.source_id = s.source_id
WHERE ls.update_date >= DATEADD(HOUR, -1, GETUTCDATE())
  AND s.source_type IN ('metadata')
GROUP BY s.source_name
ORDER BY s.source_name;
```

If this returns no rows, the last scheduled metadata run did not load anything.

---

## Expected Cadence

| Task mode | Schedule | Registration helper | Expected launches/day |
|-----------|----------|---------------------|-----------------------|
| Metadata | Hourly at `:05` and `:10` | `.ts.metadata.ps1` | 48 |
| Delta | Hourly at `:20`, `:30`, and `:40` | `.ts.delta.ps1` | 72 across three tasks |
| Hourly | Hourly at `:50` | `.ts.hourly.ps1` | 24 |
| Baseline | Manual only | none active | On-demand |
