# Azure VM Operations

Use this directory for Azure VM setup notes, deployment commands, and runtime
service definitions.

## Current Goal

Deploy the first promoted scheduled backend workflow to an Azure Ubuntu VM:

```text
backend.orchestration.power.pjm.da_hrl_lmps
```

The workflow pulls PJM Day-Ahead Hourly LMPs, upserts `pjm.da_hrl_lmps`, writes
`ops.pipeline_runs` and `ops.api_fetch_log`, and emits arrival alerts through
`alerts.events`.

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

sudo -u helios git clone <repo-url> /opt/helioscta-platform
sudo -u helios python3 -m venv /opt/helioscta-platform/.venv
sudo -u helios /opt/helioscta-platform/.venv/bin/python -m pip install --upgrade pip
sudo -u helios /opt/helioscta-platform/.venv/bin/pip install \
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

## Manual Smoke Checks

Run these before installing timers:

```bash
cd /opt/helioscta-platform
sudo -u helios git rev-parse HEAD
sudo -u helios git status --short

sudo -u helios /opt/helioscta-platform/.venv/bin/python -c \
  "from backend.orchestration.power.pjm import da_hrl_lmps; print(da_hrl_lmps.API_SCRAPE_NAME)"
```

Install the service unit and run the full workflow manually only during the PJM
publish window unless you intend to wait through the polling ceiling:

```bash
sudo cp infrastructure/systemd/helios-da-hrl-lmps.service /etc/systemd/system/
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
cd /opt/helioscta-platform
sudo cp infrastructure/systemd/helios-da-hrl-lmps.service /etc/systemd/system/
sudo cp infrastructure/systemd/helios-da-hrl-lmps.timer /etc/systemd/system/
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

Verify database telemetry with `helios_readonly` or another read-only
inspection user:

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

After the first successful run, record the host, deployed commit, schedule, and
logs in `docs/deployments.md`.

## Deployment Commands

Use this steady-state deploy path after the VM is bootstrapped:

```bash
cd /opt/helioscta-platform
sudo -u helios git pull --ff-only
sudo -u helios git rev-parse HEAD
sudo -u helios git status --short
sudo -u helios /opt/helioscta-platform/.venv/bin/pip install \
  -r backend/requirements.txt \
  -e backend
sudo systemctl restart helios-da-hrl-lmps.timer
systemctl list-timers 'helios-*'
```

Do not edit production files directly under `/opt/helioscta-platform`. If an
emergency patch is made on the VM, bring it back into Git immediately.
