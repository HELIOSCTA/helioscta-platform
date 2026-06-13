# systemd Jobs

Store production service and timer definitions here.

Each promoted scheduled script should have:

- one `.service` file for the script command
- one `.timer` file for the schedule
- a matching entry in `docs/deployments.md`
- script logging plus API telemetry or data-availability visibility inside the
  script or wrapper

Set the service environment from a root-owned env file, for example:

```ini
EnvironmentFile=/etc/helioscta/backend.env
WorkingDirectory=/opt/helioscta-platform
ExecStart=/opt/helioscta-platform/.venv/bin/python -m backend.orchestration.power.pjm.da_hrl_lmps
```

Use `HELIOS_LOG_DIR=/var/log/helioscta` in that env file if file logs should
be retained outside journald.

## First Job

The first production timer is:

```text
helios-da-hrl-lmps.service
helios-da-hrl-lmps.timer
```

It runs `backend.orchestration.power.pjm.da_hrl_lmps`, not the lower-level
scrape module, so the scheduled path includes PJM polling, API fetch logging,
terminal/file logging, and DA LMP data readiness event emission.

The live production VM currently has `helios-da-hrl-lmps.timer` enabled on
`helioscta-prod-vm-01` at `16:00 UTC` with `Persistent=true`. The deployment
register records the exact deployed commit and verification state.

## PJM Data Miner Batch

The promoted support PJM Data Miner scrape modules are scheduled through one
daily batch timer:

```text
helios-pjm-data-miner-batch.service
helios-pjm-data-miner-batch.timer
```

It runs `backend.orchestration.power.pjm.data_miner_batch`, which executes 29
lower-level scrape modules that are not covered by dedicated priority timers.
The service uses `flock` with
`/tmp/helios-pjm-data-miner-batch.lock` so a delayed run cannot overlap the next
batch.

## RT Verified Five-Minute HRL LMPs

The priority verified five-minute RT price workflow has its own timer:

```text
helios-rt-fivemin-hrl-lmps.service
helios-rt-fivemin-hrl-lmps.timer
```

It runs `backend.orchestration.power.pjm.rt_fivemin_hrl_lmps`, which reuses the
lower-level scrape, upserts `pjm.rt_fivemin_hrl_lmps`, and emits complete-day
readiness events for hub, zone, and interface pricing nodes. The service uses
`flock` with `/tmp/helios-rt-fivemin-hrl-lmps.lock`.

## Production Health Digest

The read-only operator health digest is available as an on-demand service:

```text
helios-prod-health-check.service
```

It runs `backend.orchestration.health.prod_health_check` with the same
`/etc/helioscta/backend.env` credential boundary as scheduled scrapes. It does
not send alerts; use `journalctl` to read the digest after a manual run.

## Naming

Use predictable names:

```text
helios-<workflow>.service
helios-<workflow>.timer
```

## Install Or Update Units

From the `azureuser` shell on the VM:

```bash
sudo cp /opt/helioscta-platform/infrastructure/systemd/helios-da-hrl-lmps.service /etc/systemd/system/
sudo cp /opt/helioscta-platform/infrastructure/systemd/helios-da-hrl-lmps.timer /etc/systemd/system/
sudo cp /opt/helioscta-platform/infrastructure/systemd/helios-rt-fivemin-hrl-lmps.service /etc/systemd/system/
sudo cp /opt/helioscta-platform/infrastructure/systemd/helios-rt-fivemin-hrl-lmps.timer /etc/systemd/system/
sudo cp /opt/helioscta-platform/infrastructure/systemd/helios-prod-health-check.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now helios-da-hrl-lmps.timer
sudo systemctl enable --now helios-rt-fivemin-hrl-lmps.timer
```

`/opt/helioscta-platform` is owned for the `helios` service user. Run repo
commands from the sudo-capable `azureuser` shell with
`sudo -u helios -H git -C /opt/helioscta-platform ...`; the `helios` user
itself should not have sudo.

Run the workflow once on demand:

```bash
sudo systemctl start helios-da-hrl-lmps.service
sudo systemctl start helios-rt-fivemin-hrl-lmps.service
sudo systemctl start helios-prod-health-check.service
```

## Verification

```bash
systemctl status helios-<workflow>.service
systemctl status helios-<workflow>.timer
journalctl -u helios-<workflow>.service -n 100
systemctl list-timers
```

For the first job:

```bash
systemctl status helios-da-hrl-lmps.service
systemctl status helios-da-hrl-lmps.timer
journalctl -u helios-da-hrl-lmps.service -n 100 --no-pager
systemctl list-timers 'helios-*'
```

For the PJM Data Miner batch:

```bash
systemctl status helios-pjm-data-miner-batch.service
systemctl status helios-pjm-data-miner-batch.timer
journalctl -u helios-pjm-data-miner-batch.service -n 200 --no-pager
```

For the RT verified five-minute HRL LMP workflow:

```bash
systemctl status helios-rt-fivemin-hrl-lmps.service
systemctl status helios-rt-fivemin-hrl-lmps.timer
journalctl -u helios-rt-fivemin-hrl-lmps.service -n 200 --no-pager
```

For the production health digest:

```bash
systemctl show helios-prod-health-check.service -p Result -p ExecMainStatus -p ActiveState -p SubState --no-pager
journalctl -u helios-prod-health-check.service -n 120 --no-pager
```

On the VM, configure `HELIOS_LOG_DIR=/var/log/helioscta`. Successful runs
delete their file log by default; failure logs are retained there while full
process output remains available in journald.

Use read-only SQL against `ops.api_fetch_log` for fetch status and against
`ops.data_availability_events` once the deployed runtime emits
data-availability events.

## Disable A Timer

```bash
sudo systemctl disable --now helios-<workflow>.timer
```
