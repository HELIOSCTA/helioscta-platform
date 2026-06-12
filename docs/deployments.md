# Deployment Register

Use this file to track production runtime deployments. Update the relevant
entry whenever a VM host, deployed commit, schedule, unit file, credential
boundary, or log path changes.

## helios-da-hrl-lmps

- Status: VM provisioned; service verification pending.
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
- First enabled at: TBD.
- Deployed commit: TBD.
- Deployed by: TBD.

Verification SQL:

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
- Record the actual deployed commit after `git pull --ff-only` on the VM.
