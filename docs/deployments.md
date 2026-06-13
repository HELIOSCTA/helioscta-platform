# Deployment Register

Use this file to track production runtime deployments. Update the relevant
entry whenever a VM host, deployed commit, schedule, unit file, credential
boundary, or log path changes.

## production-vm-operations

- Status: deployed; CI/checklist discipline, log retention policy, and VM
  rebuild runbook are versioned.
- Host: `helioscta-prod-vm-01`.
- Runtime path: `/opt/helioscta-platform`.
- Service user: `helios`.
- Operator SSH user: `azureuser`.
- Log retention unit: `infrastructure/systemd/journald-helioscta.conf`.
- Installed path: `/etc/systemd/journald.conf.d/helioscta.conf`.
- Deployed commit: verify on the VM with
  `sudo -u helios -H git -C /opt/helioscta-platform rev-parse HEAD`.
- Policy: journald capped at `1G` and `30day`; runtime journal capped at
  `256M`; failed scrape file logs retained under `/var/log/helioscta`.
- Operator docs:
  - `docs/workflow-promotion-checklist.md`
  - `docs/operations/log-retention.md`
  - `docs/operations/vm-rebuild-runbook.md`
- Verification:
  - GitHub Actions CI validates backend tests and dbt parse/critical compile.
  - VM verification commands: `journalctl --disk-usage` and
    `systemctl list-timers 'helios-*'`.

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
- Overlap protection: service uses `/usr/bin/flock` with
  `/tmp/helios-da-hrl-lmps.lock`.
- Database role: `helios_admin` through `AZURE_POSTGRES_WRITER_*`.
- First enabled at: `2026-06-12 20:13:05 UTC`.
- Deployed commit: `5d4b10b0933a1b4df087cdb811b7e9e335433c3c`.
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

- Status: deployed; daily batch timer enabled.
- Scope: 31 promoted PJM Data Miner scrape modules under
  `backend.scrapes.power.pjm`; 29 support scrapes run through the shared batch
  after `da_hrl_lmps` and `rt_fivemin_hrl_lmps` were promoted to dedicated
  orchestration timers.
- Destination schema: `pjm`.
- VM path: `/opt/helioscta-platform`.
- Azure VM host/name: `helioscta-prod-vm-01`.
- Service user: `helios`.
- Environment file: `/etc/helioscta/backend.env`.
- Database role: `helios_admin` through `AZURE_POSTGRES_WRITER_*`.
- Deployed commit: `5d4b10b0933a1b4df087cdb811b7e9e335433c3c`.
- Deployed by: Aidan Keaveny via Codex.
- Deployed at: `2026-06-13 02:17 UTC`.
- Verification: VM fast-forward pull succeeded, dependencies reinstalled, and
  a server-side import smoke check loaded all 31 PJM scrape modules.
- Unit files:
  - `infrastructure/systemd/helios-pjm-data-miner-batch.service`
  - `infrastructure/systemd/helios-pjm-data-miner-batch.timer`
- Schedule: daily at `04:30 UTC` with `RandomizedDelaySec=10min`.
- Timer behavior: `Persistent=true`; missed runs fire after VM downtime.
- Overlap protection: service uses `/usr/bin/flock` with
  `/tmp/helios-pjm-data-miner-batch.lock`.
- Scheduling posture: the batch keeps the non-priority support scrape tables
  fresh daily. `helios-da-hrl-lmps.timer` and
  `helios-rt-fivemin-hrl-lmps.timer` remain separate because those price
  workflows emit data-readiness events.

## helios-rt-fivemin-hrl-lmps

- Status: deployed; timer enabled and latest manual run succeeded.
- Workflow: PJM verified five-minute Real-Time HRL LMP orchestration.
- Runtime module: `backend.orchestration.power.pjm.rt_fivemin_hrl_lmps`.
- Lower-level scrape module: `backend.scrapes.power.pjm.rt_fivemin_hrl_lmps`.
- Source system: PJM Data Miner 2 `rt_fivemin_hrl_lmps`.
- Destination table: `pjm.rt_fivemin_hrl_lmps`.
- API telemetry: `ops.api_fetch_log`.
- Data readiness output: `ops.data_availability_events`.
- Unit files:
  - `infrastructure/systemd/helios-rt-fivemin-hrl-lmps.service`
  - `infrastructure/systemd/helios-rt-fivemin-hrl-lmps.timer`
- VM path: `/opt/helioscta-platform`.
- Azure VM host/name: `helioscta-prod-vm-01`.
- Service user: `helios`.
- Environment file: `/etc/helioscta/backend.env`.
- File log path: `/var/log/helioscta`.
- Journal logs: `journalctl -u helios-rt-fivemin-hrl-lmps.service`.
- Schedule: daily at `09:30 UTC` with `RandomizedDelaySec=5min`.
- Timer behavior: `Persistent=true`; missed runs fire after VM downtime.
- Overlap protection: service uses `/usr/bin/flock` with
  `/tmp/helios-rt-fivemin-hrl-lmps.lock`.
- Database role: `helios_admin` through `AZURE_POSTGRES_WRITER_*`.
- First enabled at: `2026-06-13 02:48:32 UTC`.
- Deployed commit: `5d4b10b0933a1b4df087cdb811b7e9e335433c3c`.
- Deployed by: Aidan Keaveny via Codex.
- Last manual verification: `2026-06-13 02:49:41 UTC`; service exited
  `status=0/SUCCESS`, upserted 12,096 rows for business date `2026-06-11`,
  and emitted
  `pjm_rt_fivemin_hrl_lmps:data_ready:2026-06-11:hub_zone_interface`.
- Next scheduled run observed: `2026-06-13 09:33:32 UTC`.
- API batching note: PJM rejected comma-separated multi-ID `pnode_id` requests
  during production optimization testing, so the runtime intentionally keeps
  `pnode_id_batch_size=1`.

## helios-prod-health-check

- Status: deployed; timer enabled and latest manual run succeeded.
- Workflow: read-only production health digest covering critical DA/RT
  readiness and support-batch API/table freshness.
- Runtime module: `backend.orchestration.health.prod_health_check`.
- Unit files:
  - `infrastructure/systemd/helios-prod-health-check.service`
  - `infrastructure/systemd/helios-prod-health-check.timer`
- VM path: `/opt/helioscta-platform`.
- Azure VM host/name: `helioscta-prod-vm-01`.
- Service user: `helios`.
- Environment file: `/etc/helioscta/backend.env`.
- Journal logs: `journalctl -u helios-prod-health-check.service`.
- Schedule: daily at `10:15 UTC` and `16:30 UTC` with
  `RandomizedDelaySec=2min`.
- Timer behavior: `Persistent=true`; missed runs fire after VM downtime.
- Alerting: intentionally disabled; digest is reviewed on demand.
- Database role: `helios_admin` through `AZURE_POSTGRES_WRITER_*`.
- First enabled at: `2026-06-13 03:08 UTC`.
- Deployed commit: `5d4b10b0933a1b4df087cdb811b7e9e335433c3c`.
- Deployed by: Aidan Keaveny via Codex.
- Last manual verification: `2026-06-13 04:19:39 UTC`; service exited
  `status=0/SUCCESS`, reported complete DA readiness for `2026-06-13`,
  complete RT verified five-minute HRL readiness for `2026-06-11`, zero
  duplicate keys, support-batch coverage of `api=29/29` and `tables=29/29`,
  all support API latest statuses as `success`, and all critical service
  results as `success`. Findings result was `PASS: no critical failures or
  warnings detected`.
- API failure findings now warn only when the latest fetch failed or recovered
  failures dominate the health window.
- Next scheduled run observed: `2026-06-13 10:16:43 UTC`.

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
WHERE pipeline_name = 'rt_fivemin_hrl_lmps'
ORDER BY created_at DESC
LIMIT 20;
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
WHERE dataset = 'pjm_rt_fivemin_hrl_lmps'
ORDER BY created_at DESC
LIMIT 10;
```
