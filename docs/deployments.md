# Deployment Register

Use this file to track production runtime deployments. Update the relevant
entry whenever a VM host, deployed commit, schedule, unit file, credential
boundary, or log path changes.

## helios-da-hrl-lmps

- Status: deployed; timer enabled and latest manual run succeeded.
- Workflow: PJM Day-Ahead Hourly LMP orchestration.
- Runtime module: `backend.orchestration.power.pjm.da_hrl_lmps`.
- Lower-level scrape module: `backend.scrapes.power.pjm.da_hrl_lmps`.
- Source system: PJM Data Miner 2 `da_hrl_lmps`.
- Destination table: `pjm.da_hrl_lmps`.
- API telemetry: `ops.api_fetch_log`.
- Data readiness output: `ops.data_availability_events`.
- Unit files:
  - `infrastructure/systemd/helios-da-hrl-lmps.service`
  - `infrastructure/systemd/helios-da-hrl-lmps.timer`
- VM path: `/opt/helioscta-platform`.
- Azure VM host/name: `helioscta-prod-vm-01`.
- Public SSH endpoint: `azureuser@20.59.106.155`.
- Private VM IP: `10.42.1.4`.
- OS: Ubuntu 22.04.5 LTS.
- Service user: `helios`.
- Operator SSH user: `azureuser`.
- Environment file: `/etc/helioscta/backend.env`.
- File log path: `/var/log/helioscta`.
- Journal logs: `journalctl -u helios-da-hrl-lmps.service`.
- Schedule: daily at `16:00 UTC`.
- Timer behavior: `Persistent=true`; missed runs fire after VM downtime.
- Database role: `helios_admin` through `AZURE_POSTGRES_WRITER_*`.
- First enabled at: `2026-06-12 20:13:05 UTC`.
- Deployed commit: `1f20a127785fdfb83223a703a70fbd65828bd2b7`.
- Deployed by: Aidan Keaveny via Codex.
- Last manual verification: `2026-06-12 20:31:09 UTC`; emitted
  `pjm_da_hrl_lmps:data_ready:2026-06-13:hub`.
- Next scheduled run observed: `2026-06-13 16:00:00 UTC`.

Verification SQL for API telemetry:

```sql
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

Verification SQL for data-availability events:

```sql
SELECT
    dataset,
    source_system,
    availability_type,
    business_date,
    scope,
    grain,
    completeness_status,
    row_count,
    entity_count,
    period_count,
    created_at
FROM ops.data_availability_events
WHERE dataset = 'pjm_da_hrl_lmps'
ORDER BY created_at DESC
LIMIT 10;
```

Operational notes:

- Run the service manually only during the PJM publish window unless waiting
  through the polling ceiling is intentional.
- Use `journalctl -u helios-da-hrl-lmps.service` for process status and
  `/var/log/helioscta` for retained failure logs.
- `/opt/helioscta-platform` is owned for the `helios` service user. From the
  `azureuser` shell, run repo commands as
  `sudo -u helios -H git -C /opt/helioscta-platform ...`; do not expect sudo
  to work after switching into a `helios` shell.
- Keep the deployment on the orchestration module so the scheduled path emits
  API telemetry and data readiness events.
- Keep one `KEY=value` per line in `/etc/helioscta/backend.env` and leave a
  trailing newline. Do not print the environment file or secrets in terminals,
  logs, or command history.
- After future `git pull --ff-only` deployments, update this register with the
  VM commit, timer state, and verification result.

## pjm-data-miner-scrape-modules

- Status: code deployed to VM; tables and indexes applied in `helios_prod`;
  no additional timers enabled.
- Scope: 31 promoted PJM Data Miner scrape modules under
  `backend.scrapes.power.pjm`.
- Destination schema: `pjm`.
- VM path: `/opt/helioscta-platform`.
- Azure VM host/name: `helioscta-prod-vm-01`.
- Service user: `helios`.
- Environment file: `/etc/helioscta/backend.env`.
- Database role: `helios_admin` through `AZURE_POSTGRES_WRITER_*`.
- Deployed commit: `1f20a127785fdfb83223a703a70fbd65828bd2b7`.
- Deployed by: Aidan Keaveny via Codex.
- Deployed at: `2026-06-13 02:17 UTC`.
- Verification: VM fast-forward pull succeeded, dependencies reinstalled, and
  a server-side import smoke check loaded all 31 PJM scrape modules.
- Scheduling posture: only `helios-da-hrl-lmps.timer` remains enabled. Do not
  schedule the rest of the scrape modules until their production cadence,
  overlap behavior, and data-readiness/telemetry requirements are selected.
