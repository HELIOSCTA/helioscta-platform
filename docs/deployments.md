# Deployment Register

Use this file to track production runtime deployments. Update the relevant
entry whenever a VM host, deployed commit, schedule, unit file, credential
boundary, or log path changes.

## helios-da-hrl-lmps

- Status: pending VM installation.
- Workflow: PJM Day-Ahead Hourly LMP orchestration.
- Runtime module: `backend.orchestration.power.pjm.da_hrl_lmps`.
- Lower-level scrape module: `backend.scrapes.power.pjm.da_hrl_lmps`.
- Source system: PJM Data Miner 2 `da_hrl_lmps`.
- Destination table: `pjm.da_hrl_lmps`.
- Pipeline telemetry: `ops.pipeline_runs`, `ops.api_fetch_log`.
- Alert output: `alerts.events`.
- Unit files:
  - `infrastructure/systemd/helios-da-hrl-lmps.service`
  - `infrastructure/systemd/helios-da-hrl-lmps.timer`
- VM path: `/opt/helioscta-platform`.
- Service user: `helios`.
- Environment file: `/etc/helioscta/backend.env`.
- File log path: `/var/log/helioscta`.
- Journal logs: `journalctl -u helios-da-hrl-lmps.service`.
- Schedule: daily at `16:00 UTC`.
- Timer behavior: `Persistent=true`; missed runs fire after VM downtime.
- Database role: `helios_admin` through `AZURE_POSTGRES_WRITER_*`.
- First enabled at: TBD.
- Azure VM host/name: TBD.
- Deployed commit: TBD.
- Deployed by: TBD.

Verification SQL:

```sql
SELECT
    pipeline_name,
    event_type,
    status,
    event_timestamp,
    rows_processed,
    error_type
FROM ops.pipeline_runs
WHERE pipeline_name = 'da_hrl_lmps'
ORDER BY event_timestamp DESC
LIMIT 10;

SELECT
    provider,
    operation_name,
    status,
    http_status,
    rows_returned,
    created_at
FROM ops.api_fetch_log
WHERE pipeline_name = 'da_hrl_lmps'
ORDER BY created_at DESC
LIMIT 10;
```

Operational notes:

- Run the service manually only during the PJM publish window unless waiting
  through the polling ceiling is intentional.
- Keep the deployment on the orchestration module so the scheduled path emits
  API telemetry and arrival alerts.
- Record the actual deployed commit after `git pull --ff-only` on the VM.
