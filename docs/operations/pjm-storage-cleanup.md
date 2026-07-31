# PJM Storage Cleanup

This note records operator steps for reducing hot Azure Postgres storage used
by PJM source tables. Run destructive SQL only after the matching scrape has
been de-scheduled in committed code and deployed to the VM.

## `pjm.load_frcstd_hist`

Status: dropped from `helios_prod` on 2026-07-29 20:52 UTC after it had been
de-scheduled from `backend.orchestration.power.pjm.data_miner_batch`. The
lower-level scrape module and reference SQL were removed from current code
after the drop; restore them from git history only if an approved
model-training or archive use case returns.

Pre-drop read-only check used for the 2026-07-29 cleanup:

```sql
SELECT
    COUNT(*) AS row_count,
    MIN(forecast_hour_beginning_utc) AS min_forecast_hour_utc,
    MAX(forecast_hour_beginning_utc) AS max_forecast_hour_utc,
    pg_size_pretty(pg_total_relation_size('pjm.load_frcstd_hist')) AS total_size;
```

Cleanup executed in `helios_prod`:

```sql
DROP TABLE pjm.load_frcstd_hist;
```

Post-cleanup verification:

```sql
SELECT
    to_regclass('pjm.load_frcstd_hist') AS target_regclass,
    pg_size_pretty(pg_database_size('helios_prod')) AS helios_prod_size;
```

The drop was run without `CASCADE` so dependent views or objects would block
the cleanup instead of being removed implicitly.
