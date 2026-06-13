# Azure VM Operations

Use this directory for Azure VM setup notes, deployment commands, and runtime
service definitions.

## Current Goal

Deploy the first promoted scheduled backend workflow to an Azure Ubuntu VM:

```text
backend.orchestration.power.pjm.da_hrl_lmps
```

The workflow pulls PJM Day-Ahead Hourly LMPs, upserts `pjm.da_hrl_lmps`, writes
`ops.api_fetch_log`, and emits readiness events through
`ops.data_availability_events`.

## Current VM

- Hostname: `helioscta-prod-vm-01`.
- Public SSH endpoint: `azureuser@20.59.106.155`.
- Private VM IP: `10.42.1.4`.
- OS: Ubuntu 22.04.5 LTS.
- Repo path: `/opt/helioscta-platform`.
- Operator SSH user: `azureuser`.
- Service user: `helios`.
- Live deployed commit: `8cf2791407161d359bb53b8f3b8f5eb3de262292`.
- Timers:
  - `helios-da-hrl-lmps.timer`, daily at `16:00 UTC`, `Persistent=true`.
  - `helios-rt-fivemin-hrl-lmps.timer`, daily at `09:30 UTC`,
    `Persistent=true`, `RandomizedDelaySec=5min`.
  - `helios-pjm-data-miner-batch.timer`, daily at `04:30 UTC`,
    `Persistent=true`, `RandomizedDelaySec=10min`.

`/opt/helioscta-platform` is intentionally not directly accessible to
`azureuser`. Stay in the `azureuser` shell for commands that need sudo, and run
repo commands as the service user with `sudo -u helios -H ...`. If you enter a
`helios` shell with `sudo -u helios -H bash`, use it only for non-sudo commands;
the `helios` user is not in sudoers.

## Target Operating Model

```text
local Codex workspace
  -> git commit
  -> git push
  -> SSH into Azure VM
  -> git pull
  -> install/update dependencies
  -> restart or verify scheduled jobs
```

The VM should run committed code only. Avoid editing production files directly
on the server unless it is an emergency, and bring any emergency fix back into
Git immediately.

As of the deployed commit above, the promoted PJM Data Miner scrape modules are
available on the VM and their database tables/indexes have been applied in
`helios_prod`. `helios-da-hrl-lmps.timer` and
`helios-rt-fivemin-hrl-lmps.timer` cover the priority price workflows with
data-readiness events. `helios-pjm-data-miner-batch.timer` runs the remaining
29 support lower-level scrape modules daily.

## Design Defaults

- Start with a manually provisioned Azure VM runbook. Add Terraform or Bicep
  later only if VM provisioning becomes repeated.
- Use Ubuntu LTS.
- Use SSH key authentication only.
- Restrict inbound SSH to trusted operator IPs through the Azure network
  security group.
- Keep the VM system timezone UTC unless every timer is reviewed.
- Check out the repo under `/opt/helioscta-platform`.
- Run scheduled jobs as a non-root `helios` service user.
- Store secrets in `/etc/helioscta/backend.env`, never in Git.
- Put long-lived file logs under `/var/log/helioscta`.
- Manage scheduled jobs with `systemd` timers after manual smoke testing.

## Azure Baseline

Create or confirm these Azure resources before bootstrapping the VM:

- Resource group and region selected for the production backend runtime.
- Ubuntu LTS VM sized for lightweight Python scrape jobs.
- SSH public key installed for the operator account.
- Network security group with inbound port `22` limited to trusted IPs.
- Outbound access to:
  - Azure Postgres on `5432`.
  - PJM Data Miner over HTTPS on `443`.
  - GitHub over HTTPS or SSH for deploy pulls.
- Azure Postgres firewall or private networking allows the VM to connect.

If Postgres uses public networking, prefer a firewall rule for the VM public IP
over broad Azure-wide access.

## VM Bootstrap

Run the bootstrap commands after SSHing into the VM as an operator with sudo
rights. Replace `<repo-url>` with the Git remote this VM should pull from.

```bash
sudo apt-get update
sudo apt-get install -y git python3 python3-venv python3-pip build-essential

sudo adduser --disabled-password --gecos "" helios
sudo install -d -o helios -g helios -m 0750 /opt/helioscta-platform
sudo install -d -o root -g helios -m 0750 /etc/helioscta
sudo install -d -o helios -g helios -m 0750 /var/log/helioscta

sudo -u helios -H git clone <repo-url> /opt/helioscta-platform
sudo -u helios -H python3 -m venv /opt/helioscta-platform/.venv
sudo -u helios -H /opt/helioscta-platform/.venv/bin/python -m pip install --upgrade pip
sudo -u helios -H /opt/helioscta-platform/.venv/bin/pip install \
  -r /opt/helioscta-platform/backend/requirements.txt \
  -e /opt/helioscta-platform/backend
```

For a private repository, configure GitHub deploy-key or token access outside
the repo before `git clone`.

## Backend Environment

Create the root-owned systemd environment file:

```bash
sudoedit /etc/helioscta/backend.env
sudo chown root:helios /etc/helioscta/backend.env
sudo chmod 0640 /etc/helioscta/backend.env
```

Use this shape and replace placeholders on the VM:

```text
AZURE_POSTGRES_WRITER_HOST=
AZURE_POSTGRES_WRITER_USER=helios_admin
AZURE_POSTGRES_WRITER_PASSWORD=
AZURE_POSTGRES_WRITER_PORT=5432
AZURE_POSTGRES_WRITER_DBNAME=helios_prod
AZURE_POSTGRES_WRITER_SSLMODE=require

HELIOS_LOG_DIR=/var/log/helioscta

PJM_API_KEY=
```

Do not create `backend/.env` on the VM unless you are doing an emergency manual
test. Production systemd jobs should consume `/etc/helioscta/backend.env`.
Keep one `KEY=value` per line and leave the file with a trailing newline. Do
not print this file to the terminal or copy secrets into shell history.

## Manual Smoke Checks

Run these before installing timers:

```bash
sudo -u helios -H git -C /opt/helioscta-platform rev-parse HEAD
sudo -u helios -H git -C /opt/helioscta-platform status --short

sudo -u helios -H /opt/helioscta-platform/.venv/bin/python -c \
  "from backend.orchestration.power.pjm import da_hrl_lmps; print(da_hrl_lmps.API_SCRAPE_NAME)"
```

Install the service unit and run the full workflow manually only during the PJM
publish window unless you intend to wait through the polling ceiling:

```bash
sudo cp /opt/helioscta-platform/infrastructure/systemd/helios-da-hrl-lmps.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl start helios-da-hrl-lmps.service
sudo systemctl status helios-da-hrl-lmps.service
```

This uses the same `EnvironmentFile` path that the timer will use, without
copying secrets into shell history or process arguments.

## Install The First Timer

The first unit files live under `infrastructure/systemd/`:

```text
helios-da-hrl-lmps.service
helios-da-hrl-lmps.timer
```

Install and start the timer:

```bash
sudo cp /opt/helioscta-platform/infrastructure/systemd/helios-da-hrl-lmps.service /etc/systemd/system/
sudo cp /opt/helioscta-platform/infrastructure/systemd/helios-da-hrl-lmps.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now helios-da-hrl-lmps.timer
```

Run once on demand:

```bash
sudo systemctl start helios-da-hrl-lmps.service
```

## Verify Runtime

```bash
systemctl list-timers 'helios-*'
systemctl status helios-da-hrl-lmps.timer
systemctl status helios-da-hrl-lmps.service
journalctl -u helios-da-hrl-lmps.service -n 100 --no-pager
```

Verify API telemetry with `helios_readonly` or another read-only inspection
user:

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

Verify data-availability events after deploying a runtime that emits them:

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

Use `journalctl -u helios-da-hrl-lmps.service -n 100 --no-pager` for process
status and `/var/log/helioscta` for retained scrape log files.

Run the read-only production health digest for morning operator review:

```bash
sudo -u helios -H /opt/helioscta-platform/.venv/bin/python \
  -m backend.orchestration.health.prod_health_check
```

After future deploys, record the deployed commit, schedule, credential boundary,
and verification result in `docs/deployments.md`.

## Deployment Commands

Use this steady-state deploy path after the VM is bootstrapped:

```bash
sudo -u helios -H git -C /opt/helioscta-platform pull --ff-only
sudo -u helios -H git -C /opt/helioscta-platform rev-parse HEAD
sudo -u helios -H git -C /opt/helioscta-platform status --short
sudo -u helios -H /opt/helioscta-platform/.venv/bin/pip install \
  -r /opt/helioscta-platform/backend/requirements.txt \
  -e /opt/helioscta-platform/backend
sudo systemctl restart helios-da-hrl-lmps.timer
sudo systemctl restart helios-rt-fivemin-hrl-lmps.timer
sudo systemctl restart helios-pjm-data-miner-batch.timer
systemctl list-timers 'helios-*'
```

Do not edit production files directly under `/opt/helioscta-platform`. If an
emergency patch is made on the VM, bring it back into Git immediately.
