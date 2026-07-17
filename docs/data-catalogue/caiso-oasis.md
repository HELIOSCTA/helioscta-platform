# CAISO OASIS

## NP15/SP15 LMPs

- Source system: CAISO Open Access Same-time Information System (OASIS).
- Source endpoint: `https://oasis.caiso.com/oasisapi/SingleZip`.
- Result format: `resultformat=6`, returned as ZIP containing CSV.
- Default pricing nodes: `TH_NP15_GEN-APND`, `TH_SP15_GEN-APND`.
- Time convention: OASIS request parameters are GMT; trading dates are Pacific
  market days.
- Runtime owner: backend power scrapes under `backend.scrapes.power.caiso`.
- Telemetry: external fetches write to `ops.api_fetch_log`.
- DDL: application tables must be created by `helios_admin` outside this repo
  before writers or schedules are enabled.

## Feeds

| Feed | OASIS query | Market | Module | Target table | Grain |
| --- | --- | --- | --- | --- | --- |
| Day-ahead LMPs | `PRC_LMP` v12 | `DAM` | `backend.scrapes.power.caiso.da_lmps` | `caiso.da_lmps` | `interval_start_time_utc x node_id x market_run_id` |
| Real-time LMPs | `PRC_INTVL_LMP` v2 | `RTM` | `backend.scrapes.power.caiso.rt_lmps` | `caiso.rt_lmps` | `interval_start_time_utc x node_id x market_run_id` |

## Normalized Columns

The CAISO CSV reports return one row per LMP component. The scrape pivots those
rows into one interval row with:

- `locational_marginal_price`
- `energy_component`
- `congestion_component`
- `loss_component`
- `greenhouse_gas_component`

Additional source identity fields retained in the target shape include
`operating_date`, `operating_hour`, `operating_interval`, `node_id_xml`,
`node_id`, `node`, `market_run_id`, `pnode_resmrid`, `grp_type`,
`source_query_name`, and `source_version`.

Target tables also need the repo-standard audit columns `created_at` and
`updated_at` because `backend.utils.db.upsert_dataframe` validates and manages
those columns during writes.

Safe reruns use primary-key upserts on
`interval_start_time_utc x node_id x market_run_id`.

## Manual Runs

Default module runs use function arguments with defaults:

```powershell
python -m backend.orchestration.power.caiso.da_lmps
python -m backend.orchestration.power.caiso.rt_lmps
```

For ad hoc local dates, edit the bottom `main(...)` call or the default
constants in the target module before running. The DA orchestration defaults to
the next Pacific trading date; RT defaults to the previous Pacific trading date.

CAISO LMP backfills use:

```powershell
python -m backend.backfills.power.caiso.da_lmps
python -m backend.backfills.power.caiso.rt_lmps
```

The scheduled DA orchestration starts before the CAISO 1:00 p.m. Pacific
day-ahead publication window and polls OASIS until the complete next trading
date is available. It logs one resolved `ops.api_fetch_log` row for the polling
outcome, emits complete-day readiness events, and queues one inline DA LMP
release email per configured `HELIOS_EMAIL_RECIPIENTS` recipient through
`ops.email_notification_outbox`.

The dedicated DA and RT backfill wrappers call their orchestration paths with
`run_mode=backfill`, so they write the same `caiso.da_lmps` or
`caiso.rt_lmps` rows, `ops.api_fetch_log` metadata, and complete-day readiness
events as the scheduled workflows. Backfills do not enqueue release emails.
Multi-day backfills include an inter-day request delay to avoid CAISO OASIS
throttling.

The nightly global LMP repair uses `backend.backfills.power.lmp_price_backfill_7_day`
to repair recent CAISO DA and RT price rows through raw scrape/upsert paths
with `repair_family=lmp_price_backfill_7_day` metadata. That repair does not
emit readiness events or release emails.

## Reference DDL

Apply the schema reference first if `caiso` does not exist:

```text
dbt/azure_postgres/reference_sql/ddl/setup/schemas.sql
```

Then apply the CAISO table files with `helios_admin` before enabling writes:

```text
dbt/azure_postgres/reference_sql/ddl/power/caiso/da_lmps/table_caiso_da_lmps.sql
dbt/azure_postgres/reference_sql/ddl/power/caiso/rt_lmps/table_caiso_rt_lmps.sql
```

Apply index files separately with autocommit enabled because they use
`CREATE INDEX CONCURRENTLY`:

```text
dbt/azure_postgres/reference_sql/ddl/power/caiso/da_lmps/index_caiso_da_lmps.sql
dbt/azure_postgres/reference_sql/ddl/power/caiso/rt_lmps/index_caiso_rt_lmps.sql
```
