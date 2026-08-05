# SPP Portal LMPs

## Source Contract

- Source system: SPP Portal file-browser API.
- DA source: `da-lmp-by-settlement-location` daily CSV files.
- RT source: `rtbm-lmp-by-location` five-minute interval CSV files.
- Credentials: none.
- Default hubs: `SPPNORTH_HUB`, `SPPSOUTH_HUB`.
- Target tables: `spp.da_lmps`, `spp.rt_lmps_prelim`.
- Grain: `operating_date x interval_start_time_utc x node_id x market_run_id`.
- Primary key: `interval_start_time_utc, node_id, market_run_id`.
- Components: total LMP, `MEC` energy, `MCC` congestion, `MLC` loss.

## Runtime

`backend.orchestration.power.spp.da_lmps` targets the next Central operating
date and polls for complete day-ahead hourly hub coverage. The VM timer is
`helios-spp-da-lmps.timer`, scheduled daily at
`15:35 America/Chicago`, polling every 10 minutes for up to two hours.

`backend.orchestration.power.spp.rt_lmps_prelim` targets the previous Central
operating date and polls for complete five-minute RTBM hub coverage. Before
downloading all 288 normal-day interval files, it checks the final expected
interval file. The VM timer is `helios-spp-rt-lmps-prelim.timer`, scheduled
daily at `00:15 America/Chicago`, polling every 15 minutes for up to 4.5 hours.

Scheduled runs write one resolved polling row to `ops.api_fetch_log`, emit
complete-day readiness events to `ops.data_availability_events`, and rely on
primary-key upserts for safe reruns. SPP DA readiness queues the shared DA LMP
release email with inline hub/hour tables and the Vercel single-day report
link.

## Operator SQL

Apply reference DDL before enabling the timers:

```text
dbt/azure_postgres/reference_sql/ddl/setup/schemas.sql
dbt/azure_postgres/reference_sql/ddl/power/spp/da_lmps/
dbt/azure_postgres/reference_sql/ddl/power/spp/rt_lmps_prelim/
```

Read-only validation:

```text
dbt/azure_postgres/reference_sql/ddl/power/spp/verify_spp_lmps.sql
```
