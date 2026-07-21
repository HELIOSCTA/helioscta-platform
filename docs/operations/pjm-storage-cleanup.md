# PJM Storage Cleanup

This note records operator steps for reducing hot Azure Postgres storage used
by PJM source tables. Run destructive SQL only after the matching scrape has
been de-scheduled in committed code and deployed to the VM.

## `pjm.load_frcstd_hist`

Status: de-scheduled from `backend.orchestration.power.pjm.data_miner_batch`.
The lower-level scrape module remains available for manual recovery, but the
table is not needed by current promoted frontend or production workflows.

Pre-cleanup read-only check:

```sql
SELECT
    COUNT(*) AS row_count,
    MIN(forecast_hour_beginning_utc) AS min_forecast_hour_utc,
    MAX(forecast_hour_beginning_utc) AS max_forecast_hour_utc,
    pg_size_pretty(pg_total_relation_size('pjm.load_frcstd_hist')) AS total_size;
```

Preferred cleanup keeps the table contract but releases storage:

```sql
TRUNCATE TABLE pjm.load_frcstd_hist;
ANALYZE pjm.load_frcstd_hist;
```

Post-cleanup verification:

```sql
SELECT
    COUNT(*) AS row_count,
    pg_size_pretty(pg_total_relation_size('pjm.load_frcstd_hist')) AS total_size;
```

Use `DROP TABLE pjm.load_frcstd_hist;` only if the table contract and reference
SQL are intentionally retired. Keeping the empty table is safer because old
manual scripts fail less abruptly and read-only permissions remain intact.
