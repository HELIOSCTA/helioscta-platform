# VM Rebuild Runbook

Use this runbook when `helioscta-prod-vm-01` must be rebuilt or replaced. The
target state is a clean Ubuntu LTS VM running committed code from Git, with
secrets outside Git and all scheduled workflows managed by systemd.

## Target State

- Host role: production backend scheduler.
- Repo path: `/opt/helioscta-platform`.
- Service user: `helios`.
- Operator SSH user: `azureuser`.
- Environment file: `/etc/helioscta/backend.env`.
- File log path: `/var/log/helioscta`.
- System timezone: UTC.
- Database role for backend jobs: `helios_admin`.
- Read-only validation role: `helios_readonly`.

## Azure Prerequisites

Confirm before bootstrapping:

- Ubuntu LTS VM is reachable by SSH.
- Inbound SSH is restricted to trusted operator IPs.
- Outbound access is available for GitHub HTTPS or SSH, PJM HTTPS, and Azure
  Postgres on port `5432`.
- Azure Postgres firewall or private networking allows the VM to connect.
- Required application tables, indexes, `ops.api_fetch_log`, and
  `ops.data_availability_events` already exist in `helios_prod`.

## Bootstrap

Run as the sudo-capable operator user:

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

For a private repository, configure deploy-key or token access outside the
repo before cloning.

## Environment

Create `/etc/helioscta/backend.env` with root ownership and group read access
for the service user:

```bash
sudoedit /etc/helioscta/backend.env
sudo chown root:helios /etc/helioscta/backend.env
sudo chmod 0640 /etc/helioscta/backend.env
```

Required shape:

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

Keep one `KEY=value` per line, leave a trailing newline, and do not print this
file in terminals or logs.

## Install OS Log Retention

```bash
sudo install -d -m 0755 /etc/systemd/journald.conf.d
sudo cp /opt/helioscta-platform/infrastructure/systemd/journald-helioscta.conf /etc/systemd/journald.conf.d/helioscta.conf
sudo systemctl restart systemd-journald
journalctl --disk-usage
```

## Install systemd Units

```bash
sudo cp /opt/helioscta-platform/infrastructure/systemd/helios-pjm-da-hrl-lmps.service /etc/systemd/system/
sudo cp /opt/helioscta-platform/infrastructure/systemd/helios-pjm-da-hrl-lmps.timer /etc/systemd/system/
sudo cp /opt/helioscta-platform/infrastructure/systemd/helios-pjm-rt-fivemin-hrl-lmps.service /etc/systemd/system/
sudo cp /opt/helioscta-platform/infrastructure/systemd/helios-pjm-rt-fivemin-hrl-lmps.timer /etc/systemd/system/
sudo cp /opt/helioscta-platform/infrastructure/systemd/helios-pjm-data-miner-batch.service /etc/systemd/system/
sudo cp /opt/helioscta-platform/infrastructure/systemd/helios-pjm-data-miner-batch.timer /etc/systemd/system/
sudo cp /opt/helioscta-platform/infrastructure/systemd/helios-pjm-da-transconstraints.service /etc/systemd/system/
sudo cp /opt/helioscta-platform/infrastructure/systemd/helios-pjm-da-transconstraints.timer /etc/systemd/system/
sudo cp /opt/helioscta-platform/infrastructure/systemd/helios-pjm-gen-outages-by-type.service /etc/systemd/system/
sudo cp /opt/helioscta-platform/infrastructure/systemd/helios-pjm-gen-outages-by-type.timer /etc/systemd/system/
sudo cp /opt/helioscta-platform/infrastructure/systemd/helios-pjm-hrl-load-prelim.service /etc/systemd/system/
sudo cp /opt/helioscta-platform/infrastructure/systemd/helios-pjm-hrl-load-prelim.timer /etc/systemd/system/
sudo cp /opt/helioscta-platform/infrastructure/systemd/helios-pjm-ops-sum.service /etc/systemd/system/
sudo cp /opt/helioscta-platform/infrastructure/systemd/helios-pjm-ops-sum.timer /etc/systemd/system/
sudo cp /opt/helioscta-platform/infrastructure/systemd/helios-prod-health-check.service /etc/systemd/system/
sudo cp /opt/helioscta-platform/infrastructure/systemd/helios-prod-health-check.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now helios-pjm-da-hrl-lmps.timer
sudo systemctl enable --now helios-pjm-rt-fivemin-hrl-lmps.timer
sudo systemctl enable --now helios-pjm-data-miner-batch.timer
sudo systemctl enable --now helios-pjm-da-transconstraints.timer
sudo systemctl enable --now helios-pjm-gen-outages-by-type.timer
sudo systemctl enable --now helios-pjm-hrl-load-prelim.timer
sudo systemctl enable --now helios-pjm-ops-sum.timer
sudo systemctl enable --now helios-prod-health-check.timer
```

## Validation

Before enabling timers:

```bash
sudo -u helios -H git -C /opt/helioscta-platform rev-parse HEAD
sudo -u helios -H git -C /opt/helioscta-platform status --short
sudo -u helios -H /opt/helioscta-platform/.venv/bin/python -c \
  "from backend.orchestration.health import prod_health_check; print(prod_health_check.__name__)"
```

After enabling timers:

```bash
systemctl list-timers 'helios-*'
sudo systemctl start helios-prod-health-check.service
journalctl -u helios-prod-health-check.service -n 120 --no-pager
```

The health digest must exit `status=0/SUCCESS` before the VM is considered
recovered.

## Recovery Notes

- Deploy only committed code. If an emergency server edit is made, bring it
  back into Git immediately.
- Keep `helios` out of sudoers; use `azureuser` for sudo commands and
  `sudo -u helios -H ...` for repo/runtime commands.
- Run price workflows manually only when the relevant PJM data is expected to
  be available, unless waiting through the polling ceiling is intentional.
- Record the rebuilt host, commit, timer state, and verification result in
  `docs/deployments.md`.
