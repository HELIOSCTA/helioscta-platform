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
ExecStart=/usr/bin/flock -n /tmp/helios-da-hrl-lmps.lock /opt/helioscta-platform/.venv/bin/python -m backend.orchestration.power.pjm.da_hrl_lmps
```

Use `HELIOS_LOG_DIR=/var/log/helioscta` in that env file if file logs should
be retained outside journald.

## Log Retention

Install the versioned journald drop-in on the VM:

```bash
sudo install -d -m 0755 /etc/systemd/journald.conf.d
sudo cp /opt/helioscta-platform/infrastructure/systemd/journald-helioscta.conf /etc/systemd/journald.conf.d/helioscta.conf
sudo systemctl restart systemd-journald
journalctl --disk-usage
```

The production policy is documented in
`docs/operations/log-retention.md`: journald is capped at `1G` and `30day`,
runtime journal storage is capped at `256M`, and failed scrape file logs are
kept under `/var/log/helioscta` for operator review.

## First Job

The first production timer is:

```text
helios-da-hrl-lmps.service
helios-da-hrl-lmps.timer
```

It runs `backend.orchestration.power.pjm.da_hrl_lmps`, not the lower-level
scrape module, so the scheduled path includes PJM polling, API fetch logging,
terminal/file logging, and DA LMP data readiness event emission.
The service uses `flock` with `/tmp/helios-da-hrl-lmps.lock`.

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

The read-only operator health digest is available as an on-demand service and
scheduled timer:

```text
helios-prod-health-check.service
helios-prod-health-check.timer
```

It runs `backend.orchestration.health.prod_health_check` with the same
`/etc/helioscta/backend.env` credential boundary as scheduled scrapes. It does
not send alerts; use `journalctl` to read the digest after a manual or
scheduled run. The digest checks critical DA/RT readiness plus support-batch
API and table freshness. Recovered low-rate API failures are not surfaced as
findings when the latest fetch succeeded. The timer runs at `10:15 UTC` and
`16:30 UTC`.

## ERCOT Settlement Point Prices

The ERCOT price workflows have dedicated timers:

```text
helios-ercot-dam-stlmnt-pnt-prices.service
helios-ercot-dam-stlmnt-pnt-prices.timer
helios-ercot-settlement-point-prices.service
helios-ercot-settlement-point-prices.timer
```

The DAM workflow runs `backend.orchestration.power.ercot.dam_stlmnt_pnt_prices`
daily at `16:15 UTC`, upserts current-delivery-date hub settlement point
prices, and emits complete delivery-date readiness events. The RT workflow runs
`backend.orchestration.power.ercot.settlement_point_prices` every 15 minutes,
upserts published hub intervals, and emits readiness only when a full delivery
date is present. Both services use `flock` to avoid overlap.

## ERCOT Load Batch

The ERCOT load support feeds run through one daily batch timer:

```text
helios-ercot-load-batch.service
helios-ercot-load-batch.timer
```

It runs `backend.orchestration.power.ercot.load_batch`, which executes
`actual_system_load` and `seven_day_load_forecast`. These are scheduled as
support feeds rather than critical readiness gates. The timer runs daily at
`12:20 UTC` with `Persistent=true` and `RandomizedDelaySec=10min`.

## ERCOT Congestion Batch

The ERCOT congestion support feeds run through one daily batch timer:

```text
helios-ercot-congestion-batch.service
helios-ercot-congestion-batch.timer
```

It runs `backend.orchestration.power.ercot.congestion_batch`, which executes
`dam_shadow_prices` and `sced_shadow_prices`. These are scheduled as support
feeds rather than critical readiness gates. The timer runs daily at `12:45 UTC`
with `Persistent=true` and `RandomizedDelaySec=10min`.

## ERCOT Renewables Batch

The ERCOT renewable production support feeds run through one daily batch timer:

```text
helios-ercot-renewables-batch.service
helios-ercot-renewables-batch.timer
```

It runs `backend.orchestration.power.ercot.renewables_batch`, which executes
`wind_power_production_hourly` and `solar_power_production_hourly`. The batch
pulls yesterday through seven days forward so the same source payload captures
completed actual generation and the current forecast curve. The timer runs
daily at `13:10 UTC` with `Persistent=true` and `RandomizedDelaySec=10min`.

## ERCOT 5-Minute Renewables Actual Batch

The ERCOT 5-minute renewable actual support feeds run through one daily batch
timer:

```text
helios-ercot-renewables-5min-batch.service
helios-ercot-renewables-5min-batch.timer
```

It runs `backend.orchestration.power.ercot.renewables_5min_batch`, which
executes `wind_power_actual_5min` and `solar_power_actual_5min`. The batch
pulls the prior complete interval-ending day. The timer runs daily at
`13:25 UTC` with `Persistent=true` and `RandomizedDelaySec=10min`.

## ERCOT Outage/Capacity Batch

The ERCOT outage and capacity support feeds run through one daily batch timer:

```text
helios-ercot-outage-capacity-batch.service
helios-ercot-outage-capacity-batch.timer
```

It runs `backend.orchestration.power.ercot.outage_capacity_batch`, which
executes `hourly_resource_outage_capacity`. The timer runs daily at `13:35 UTC`
with `Persistent=true` and `RandomizedDelaySec=10min`.

## Manual DA/RT Backfills

DA hourly LMP and RT verified five-minute HRL LMP backfills are manual
operator workflows, not timers:

```text
backend.orchestration.power.pjm.da_hrl_lmps_backfill
backend.orchestration.power.pjm.rt_fivemin_hrl_lmps_backfill
```

Run them with `systemd-run` so `/etc/helioscta/backend.env` is loaded by
systemd instead of shell-sourced. This avoids corrupting secrets that contain
characters such as `$`. See `docs/operations/manual-backfills.md` for exact
commands and verification SQL.

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
sudo cp /opt/helioscta-platform/infrastructure/systemd/helios-prod-health-check.timer /etc/systemd/system/
sudo cp /opt/helioscta-platform/infrastructure/systemd/helios-ercot-dam-stlmnt-pnt-prices.service /etc/systemd/system/
sudo cp /opt/helioscta-platform/infrastructure/systemd/helios-ercot-dam-stlmnt-pnt-prices.timer /etc/systemd/system/
sudo cp /opt/helioscta-platform/infrastructure/systemd/helios-ercot-settlement-point-prices.service /etc/systemd/system/
sudo cp /opt/helioscta-platform/infrastructure/systemd/helios-ercot-settlement-point-prices.timer /etc/systemd/system/
sudo cp /opt/helioscta-platform/infrastructure/systemd/helios-ercot-load-batch.service /etc/systemd/system/
sudo cp /opt/helioscta-platform/infrastructure/systemd/helios-ercot-load-batch.timer /etc/systemd/system/
sudo cp /opt/helioscta-platform/infrastructure/systemd/helios-ercot-congestion-batch.service /etc/systemd/system/
sudo cp /opt/helioscta-platform/infrastructure/systemd/helios-ercot-congestion-batch.timer /etc/systemd/system/
sudo cp /opt/helioscta-platform/infrastructure/systemd/helios-ercot-renewables-batch.service /etc/systemd/system/
sudo cp /opt/helioscta-platform/infrastructure/systemd/helios-ercot-renewables-batch.timer /etc/systemd/system/
sudo cp /opt/helioscta-platform/infrastructure/systemd/helios-ercot-renewables-5min-batch.service /etc/systemd/system/
sudo cp /opt/helioscta-platform/infrastructure/systemd/helios-ercot-renewables-5min-batch.timer /etc/systemd/system/
sudo cp /opt/helioscta-platform/infrastructure/systemd/helios-ercot-outage-capacity-batch.service /etc/systemd/system/
sudo cp /opt/helioscta-platform/infrastructure/systemd/helios-ercot-outage-capacity-batch.timer /etc/systemd/system/
sudo install -d -m 0755 /etc/systemd/journald.conf.d
sudo cp /opt/helioscta-platform/infrastructure/systemd/journald-helioscta.conf /etc/systemd/journald.conf.d/helioscta.conf
sudo systemctl daemon-reload
sudo systemctl enable --now helios-da-hrl-lmps.timer
sudo systemctl enable --now helios-rt-fivemin-hrl-lmps.timer
sudo systemctl enable --now helios-ercot-dam-stlmnt-pnt-prices.timer
sudo systemctl enable --now helios-ercot-settlement-point-prices.timer
sudo systemctl enable --now helios-ercot-load-batch.timer
sudo systemctl enable --now helios-ercot-congestion-batch.timer
sudo systemctl enable --now helios-ercot-renewables-batch.timer
sudo systemctl enable --now helios-ercot-renewables-5min-batch.timer
sudo systemctl enable --now helios-ercot-outage-capacity-batch.timer
sudo systemctl enable --now helios-prod-health-check.timer
```

`/opt/helioscta-platform` is owned for the `helios` service user. Run repo
commands from the sudo-capable `azureuser` shell with
`sudo -u helios -H git -C /opt/helioscta-platform ...`; the `helios` user
itself should not have sudo.

Run the workflow once on demand:

```bash
sudo systemctl start helios-da-hrl-lmps.service
sudo systemctl start helios-rt-fivemin-hrl-lmps.service
sudo systemctl start helios-ercot-dam-stlmnt-pnt-prices.service
sudo systemctl start helios-ercot-settlement-point-prices.service
sudo systemctl start helios-ercot-load-batch.service
sudo systemctl start helios-ercot-congestion-batch.service
sudo systemctl start helios-ercot-renewables-batch.service
sudo systemctl start helios-ercot-renewables-5min-batch.service
sudo systemctl start helios-ercot-outage-capacity-batch.service
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
systemctl status helios-prod-health-check.timer
journalctl -u helios-prod-health-check.service -n 220 --no-pager
```

For ERCOT settlement point prices:

```bash
systemctl status helios-ercot-dam-stlmnt-pnt-prices.service
systemctl status helios-ercot-dam-stlmnt-pnt-prices.timer
journalctl -u helios-ercot-dam-stlmnt-pnt-prices.service -n 200 --no-pager
systemctl status helios-ercot-settlement-point-prices.service
systemctl status helios-ercot-settlement-point-prices.timer
journalctl -u helios-ercot-settlement-point-prices.service -n 200 --no-pager
```

For the ERCOT load batch:

```bash
systemctl status helios-ercot-load-batch.service
systemctl status helios-ercot-load-batch.timer
journalctl -u helios-ercot-load-batch.service -n 200 --no-pager
```

For the ERCOT congestion batch:

```bash
systemctl status helios-ercot-congestion-batch.service
systemctl status helios-ercot-congestion-batch.timer
journalctl -u helios-ercot-congestion-batch.service -n 200 --no-pager
```

For the ERCOT renewables batch:

```bash
systemctl status helios-ercot-renewables-batch.service
systemctl status helios-ercot-renewables-batch.timer
journalctl -u helios-ercot-renewables-batch.service -n 200 --no-pager
```

For the ERCOT 5-minute renewables actual batch:

```bash
systemctl status helios-ercot-renewables-5min-batch.service
systemctl status helios-ercot-renewables-5min-batch.timer
journalctl -u helios-ercot-renewables-5min-batch.service -n 200 --no-pager
```

For the ERCOT outage/capacity batch:

```bash
systemctl status helios-ercot-outage-capacity-batch.service
systemctl status helios-ercot-outage-capacity-batch.timer
journalctl -u helios-ercot-outage-capacity-batch.service -n 200 --no-pager
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
