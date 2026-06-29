# systemd Jobs

Store Linux production service and timer definitions here. This directory is
the Linux VM deploy manifest for scheduled backend workflows.

Local Windows ICE Python jobs are intentionally excluded from this directory.
They are activated through `infrastructure/windows-service/` and must not
receive Linux `.service` or `.timer` files.

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

It runs `backend.orchestration.power.pjm.data_miner_batch`, which executes 27
lower-level scrape modules that are not covered by dedicated timers.
The service uses `flock` with
`/tmp/helios-pjm-data-miner-batch.lock` so a delayed run cannot overlap the next
batch.

## PJM Operations Summary

The PJM Operations Summary feeds have one daily batch timer:

```text
helios-pjm-ops-sum.service
helios-pjm-ops-sum.timer
```

It runs `backend.orchestration.power.pjm.ops_sum`, upserts
`ops_sum_frcstd_tran_lim`, `ops_sum_frcst_peak_area`,
`ops_sum_frcst_peak_rto`, `ops_sum_prev_period`, and
`ops_sum_prjctd_tie_flow` into the `pjm` schema, and writes API fetch
telemetry to `ops.api_fetch_log`. PJM Data Miner refreshes these feeds on top
of the hour from 05:00 through 08:00 EPT, so the timer runs daily at `05:05`,
`06:05`, `07:05`, and `08:05 America/New_York` with `Persistent=true` and
`AccuracySec=1min`. The service uses `flock` with
`/tmp/helios-pjm-ops-sum.lock`.

Before enabling the timer, apply the table and index operator SQL under:

```text
dbt/azure_postgres/models/power/pjm/ops_sum_frcst_peak_area/
dbt/azure_postgres/models/power/pjm/ops_sum_frcst_peak_rto/
dbt/azure_postgres/models/power/pjm/ops_sum_frcstd_tran_lim/
dbt/azure_postgres/models/power/pjm/ops_sum_prev_period/
dbt/azure_postgres/models/power/pjm/ops_sum_prjctd_tie_flow/
```

## PJM Price Backfill Repair

The promoted LMP price repair workflow has one daily timer:

```text
helios-pjm-hourly-price-backfill-7-day.service
helios-pjm-hourly-price-backfill-7-day.timer
```

It runs `backend.orchestration.power.pjm.hourly_price_backfill_7_day`, which
executes seven-day backfills for `da_hrl_lmps`, `rt_hrl_lmps`,
`rt_fivemin_hrl_lmps`, and `rt_unverified_hrl_lmps`. The job writes to the
canonical `pjm` price tables through the existing idempotent upsert keys and
stamps PJM API telemetry with `run_mode=backfill` metadata in
`ops.api_fetch_log`. The verified RT five-minute leg also emits complete-day
readiness events through the existing orchestration path.

The timer runs daily at `02:00 America/New_York` with `Persistent=true` and
`RandomizedDelaySec=10min`. The workflow uses feed-specific publication lags:
DA through the current PJM market date, unverified RT hourly through the prior
market date, and verified RT hourly and verified RT five-minute through two
market dates back. The service uses `flock` with
`/tmp/helios-pjm-hourly-price-backfill-7-day.lock`.

## PJM Generation Outages By Type

The PJM seven-day generation outage by type feed has its own daily timer:

```text
helios-pjm-gen-outages-by-type.service
helios-pjm-gen-outages-by-type.timer
```

It runs `backend.scrapes.power.pjm.gen_outages_by_type`, upserts the current
PJM Data Miner `gen_outages_by_type` publication into
`pjm.gen_outages_by_type`, and writes API fetch telemetry to
`ops.api_fetch_log`. PJM Data Miner lists the source update availability as
daily `06:00 a.m.` EPT, so the timer runs daily at `06:05`, `06:30`, and
`07:00 America/New_York` with `Persistent=true` and `AccuracySec=1min`.
During daylight saving time that is `10:05`, `10:30`, and `11:00 UTC`; during
standard time it is `11:05`, `11:30`, and `12:00 UTC`. The service uses `flock` with
`/tmp/helios-pjm-gen-outages-by-type.lock`.

## PJM Hourly Forecasts

The PJM Data Miner hourly load, solar, and wind forecast workflow has one
combined timer:

```text
helios-pjm-forecast-hourly.service
helios-pjm-forecast-hourly.timer
```

It runs `backend.orchestration.power.pjm.forecast_hourly`, upserts the current
PJM Data Miner `load_frcstd_7_day`, `hourly_solar_power_forecast`, and
`hourly_wind_power_forecast` feeds into `pjm.load_frcstd_7_day`,
`pjm.hourly_solar_power_forecast`, and `pjm.hourly_wind_power_forecast`, and
writes API fetch telemetry to `ops.api_fetch_log`. The timer runs hourly at
minute `35` UTC with `Persistent=false` because the sources return current
forecast snapshots/native forecast vintages. The service uses `flock` with
`/tmp/helios-pjm-forecast-hourly.lock`.

Before enabling the timer, apply the table and index operator SQL under:

```text
dbt/azure_postgres/models/power/pjm/load_frcstd_7_day/
dbt/azure_postgres/models/power/pjm/hourly_solar_power_forecast/
dbt/azure_postgres/models/power/pjm/hourly_wind_power_forecast/
```

## PJM Meteologica Hourly Forecasts

The PJM Meteologica forecast workflow has its own timer:

```text
helios-pjm-meteologica-forecast-hourly.service
helios-pjm-meteologica-forecast-hourly.timer
```

It runs `backend.orchestration.power.pjm.meteologica_forecast_hourly`, upserts
load, solar, and wind hourly forecasts for `RTO`, `MIDATL`, `SOUTH`, and
`WEST` into `meteologica.pjm_forecast_hourly`, writes Meteologica API telemetry
to `ops.api_fetch_log`, and emits forecast freshness events to
`ops.data_availability_events`. The timer runs every 30 minutes at `:20` and
`:50` UTC with `Persistent=false` and `RandomizedDelaySec=2min`. The service
uses `flock` with `/tmp/helios-pjm-meteologica-forecast-hourly.lock`.
Successful runs purge forecast issues older than 90 days from the hot table.

Do not enable this timer until `/etc/helioscta/backend.env` contains
`XTRADERS_API_USERNAME_ISO` and `XTRADERS_API_PASSWORD_ISO`, and the
Meteologica schema/table/index operator SQL has been applied.

After those prerequisites are complete:

```bash
sudo cp /opt/helioscta-platform/infrastructure/systemd/helios-pjm-meteologica-forecast-hourly.service /etc/systemd/system/
sudo cp /opt/helioscta-platform/infrastructure/systemd/helios-pjm-meteologica-forecast-hourly.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl start helios-pjm-meteologica-forecast-hourly.service
sudo systemctl enable --now helios-pjm-meteologica-forecast-hourly.timer
```

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

## ISO-NE ISO Express Feeds

The ISO-NE ISO Express workflows have dedicated daily timers:

```text
helios-isone-da-hrl-lmps.service
helios-isone-da-hrl-lmps.timer
helios-isone-rt-hrl-lmps-prelim.service
helios-isone-rt-hrl-lmps-prelim.timer
helios-isone-rt-hrl-lmps-final.service
helios-isone-rt-hrl-lmps-final.timer
helios-isone-hourly-system-demand.service
helios-isone-hourly-system-demand.timer
helios-isone-da-hrl-cleared-demand.service
helios-isone-da-hrl-cleared-demand.timer
helios-isone-forecast-batch.service
helios-isone-forecast-batch.timer
helios-isone-rt-hrl-scheduled-interchange.service
helios-isone-rt-hrl-scheduled-interchange.timer
helios-isone-external-interface-metered-data.service
helios-isone-external-interface-metered-data.timer
```

The DA workflow runs `backend.orchestration.power.isone.da_hrl_lmps`, upserts
current Eastern operating-date ISO Express hourly day-ahead LMP CSV rows into `isone.da_hrl_lmps`,
writes API telemetry to `ops.api_fetch_log`, and emits complete-date readiness
events when all hourly location rows are present. The timer runs daily at
`17:10 UTC` with `Persistent=true` and `RandomizedDelaySec=5min`.

The final RT workflow runs
`backend.orchestration.power.isone.rt_hrl_lmps_final`, upserts finalized
hourly real-time LMP CSV rows into `isone.rt_hrl_lmps_final`, and emits the
same complete-date readiness signal. Its scheduled default pulls two days back
to avoid ISO-NE's finalization lag. The timer runs daily at `20:10 UTC` with
`Persistent=true` and `RandomizedDelaySec=5min`.

The preliminary RT workflow runs
`backend.orchestration.power.isone.rt_hrl_lmps_prelim`, upserts preliminary
hourly real-time LMP CSV rows into `isone.rt_hrl_lmps_prelim`, and emits the
same complete-date readiness signal. The timer runs daily at `01:10 UTC` with
`Persistent=true` and `RandomizedDelaySec=5min`.

The hourly system demand workflow runs
`backend.orchestration.power.isone.hourly_system_demand`, upserts previous
complete Eastern operating-date hourly actual load rows into
`isone.hourly_system_demand`, and emits a complete-date system readiness
signal. The timer runs daily at `06:10 UTC` with `Persistent=true` and
`RandomizedDelaySec=5min`.

The day-ahead cleared demand workflow runs
`backend.orchestration.power.isone.da_hrl_cleared_demand`, upserts current
Eastern operating-date hourly day-ahead cleared demand rows into
`isone.da_hrl_cleared_demand`, and emits a complete-date system readiness
signal. The timer runs daily at `17:20 UTC` with `Persistent=true` and
`RandomizedDelaySec=5min`.

The forecast batch runs `backend.orchestration.power.isone.forecast_batch` and
upserts the three-day reliability-region demand forecast, seven-day capacity
forecast, seven-day wind forecast, and seven-day solar forecast tables. The
timer runs daily at `15:20 UTC` with `Persistent=true` and
`RandomizedDelaySec=5min`.

The real-time hourly scheduled interchange workflow runs
`backend.orchestration.power.isone.rt_hrl_scheduled_interchange`, upserts
actual interchange, purchases, and sales by hourly interface into
`isone.rt_hrl_scheduled_interchange`, and emits complete-date interface
readiness events. The timer runs daily at `06:25 UTC` with `Persistent=true`
and `RandomizedDelaySec=5min`.

The external interface metered data workflow runs
`backend.orchestration.power.isone.external_interface_metered_data`, pulls the
annual ISO-NE workbook, upserts ISO-NE control-area totals plus interface-level
metered interchange and DA/RT price components into
`isone.external_interface_metered_data`, and emits complete-date readiness
events for dates present in the workbook. The timer runs weekly on Mondays at
`07:10 UTC` with `Persistent=true` and `RandomizedDelaySec=10min`.

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
executes `hourly_resource_outage_capacity` and `short_term_system_adequacy`.
The timer runs daily at `13:35 UTC` with `Persistent=true` and
`RandomizedDelaySec=10min`.

## Manual PJM Backfills

Most PJM backfills are manual operator workflows, not timers:

```text
backend.backfills.power.pjm.da_hrl_lmps
backend.backfills.power.pjm.rt_hrl_lmps
backend.backfills.power.pjm.rt_unverified_hrl_lmps
backend.backfills.power.pjm.gen_outages_by_type
```

Deploy them with the repo, but do not install persistent `.service` or
`.timer` units for one-off backfill modules. Run them on demand with `systemd-run` so
`/etc/helioscta/backend.env` is loaded by systemd instead of shell-sourced.
This avoids corrupting secrets that contain characters such as `$`. See
`docs/operations/manual-backfills.md` for exact commands and verification SQL.
The exception is `backend.orchestration.power.pjm.hourly_price_backfill_7_day`,
which is a promoted scheduled repair wrapper around the hourly LMP backfill
modules.

## NOAA METAR Weather

The NOAA AviationWeather METAR workflow has its own timer:

```text
helios-weather-noaa-metar-observations.service
helios-weather-noaa-metar-observations.timer
```

It runs `backend.orchestration.weather.noaa.metar_observations`, pulls public
METAR observations for the PJM station basket, upserts
`weather.noaa_metar_observations`, writes NOAA API telemetry to
`ops.api_fetch_log`, and emits weather freshness events to
`ops.data_availability_events`. The timer runs every 15 minutes at minutes
`07`, `22`, `37`, and `52` UTC with `Persistent=false`. The service uses
`flock` with `/tmp/helios-weather-noaa-metar-observations.lock`.

Do not enable this timer until the weather schema/table/index operator SQL has
been applied.

After those prerequisites are complete:

```bash
sudo cp /opt/helioscta-platform/infrastructure/systemd/helios-weather-noaa-metar-observations.service /etc/systemd/system/
sudo cp /opt/helioscta-platform/infrastructure/systemd/helios-weather-noaa-metar-observations.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl start helios-weather-noaa-metar-observations.service
sudo systemctl enable --now helios-weather-noaa-metar-observations.timer
```

Verify the workflow with:

```bash
systemctl status helios-weather-noaa-metar-observations.service
systemctl status helios-weather-noaa-metar-observations.timer
journalctl -u helios-weather-noaa-metar-observations.service -n 200 --no-pager
```

## WSI Hourly Observed Weather

The WSI hourly observed weather workflow has its own timer:

```text
helios-weather-wsi-hourly-observed.service
helios-weather-wsi-hourly-observed.timer
```

It runs `backend.orchestration.weather.wsi.hourly_observed`, pulls WSI Trader
Historical Observations for the PJM station basket, upserts
`weather.wsi_hourly_observed_temperatures`, writes WSI API telemetry to
`ops.api_fetch_log`, and emits weather freshness events to
`ops.data_availability_events`. The timer runs hourly at minute `20` UTC with
`Persistent=false` because the scheduled default pulls a rolling recent window.
The service uses `flock` with
`/tmp/helios-weather-wsi-hourly-observed.lock`.

Do not enable this timer until `/etc/helioscta/backend.env` contains
`WSI_TRADER_USERNAME`, `WSI_TRADER_NAME`, and `WSI_TRADER_PASSWORD`, and the
weather schema/table/index operator SQL has been applied.

After those prerequisites are complete:

```bash
sudo cp /opt/helioscta-platform/infrastructure/systemd/helios-weather-wsi-hourly-observed.service /etc/systemd/system/
sudo cp /opt/helioscta-platform/infrastructure/systemd/helios-weather-wsi-hourly-observed.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl start helios-weather-wsi-hourly-observed.service
sudo systemctl enable --now helios-weather-wsi-hourly-observed.timer
```

Verify the workflow with:

```bash
systemctl status helios-weather-wsi-hourly-observed.service
systemctl status helios-weather-wsi-hourly-observed.timer
journalctl -u helios-weather-wsi-hourly-observed.service -n 200 --no-pager
```

## WSI Hourly Forecast Weather

The WSI hourly forecast weather workflow has its own timer:

```text
helios-weather-wsi-hourly-forecast.service
helios-weather-wsi-hourly-forecast.timer
```

It runs `backend.orchestration.weather.wsi.hourly_forecast`, pulls WSI Trader
Hourly Forecast rows for the PJM station basket, upserts
`weather.wsi_hourly_forecasts`, writes WSI API telemetry to
`ops.api_fetch_log`, and emits weather forecast freshness events to
`ops.data_availability_events`. The timer runs hourly at minute `32` UTC with
`Persistent=false`; each run stores the latest WSI forecast issue returned by
the source. The service uses `flock` with
`/tmp/helios-weather-wsi-hourly-forecast.lock`.

Do not enable this timer until `/etc/helioscta/backend.env` contains
`WSI_TRADER_USERNAME`, `WSI_TRADER_NAME`, and `WSI_TRADER_PASSWORD`, and the
weather forecast table/index operator SQL has been applied.

After those prerequisites are complete:

```bash
sudo cp /opt/helioscta-platform/infrastructure/systemd/helios-weather-wsi-hourly-forecast.service /etc/systemd/system/
sudo cp /opt/helioscta-platform/infrastructure/systemd/helios-weather-wsi-hourly-forecast.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl start helios-weather-wsi-hourly-forecast.service
sudo systemctl enable --now helios-weather-wsi-hourly-forecast.timer
```

Verify the workflow with:

```bash
systemctl status helios-weather-wsi-hourly-forecast.service
systemctl status helios-weather-wsi-hourly-forecast.timer
journalctl -u helios-weather-wsi-hourly-forecast.service -n 200 --no-pager
```

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
sudo cp /opt/helioscta-platform/infrastructure/systemd/helios-pjm-rt-hrl-lmps.service /etc/systemd/system/
sudo cp /opt/helioscta-platform/infrastructure/systemd/helios-pjm-rt-hrl-lmps.timer /etc/systemd/system/
sudo cp /opt/helioscta-platform/infrastructure/systemd/helios-pjm-hourly-price-backfill-7-day.service /etc/systemd/system/
sudo cp /opt/helioscta-platform/infrastructure/systemd/helios-pjm-hourly-price-backfill-7-day.timer /etc/systemd/system/
sudo cp /opt/helioscta-platform/infrastructure/systemd/helios-pjm-gen-outages-by-type.service /etc/systemd/system/
sudo cp /opt/helioscta-platform/infrastructure/systemd/helios-pjm-gen-outages-by-type.timer /etc/systemd/system/
sudo cp /opt/helioscta-platform/infrastructure/systemd/helios-pjm-load-frcstd-7-day.service /etc/systemd/system/
sudo cp /opt/helioscta-platform/infrastructure/systemd/helios-pjm-load-frcstd-7-day.timer /etc/systemd/system/
sudo cp /opt/helioscta-platform/infrastructure/systemd/helios-pjm-ops-sum.service /etc/systemd/system/
sudo cp /opt/helioscta-platform/infrastructure/systemd/helios-pjm-ops-sum.timer /etc/systemd/system/
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
sudo cp /opt/helioscta-platform/infrastructure/systemd/helios-isone-da-hrl-lmps.service /etc/systemd/system/
sudo cp /opt/helioscta-platform/infrastructure/systemd/helios-isone-da-hrl-lmps.timer /etc/systemd/system/
sudo cp /opt/helioscta-platform/infrastructure/systemd/helios-isone-rt-hrl-lmps-prelim.service /etc/systemd/system/
sudo cp /opt/helioscta-platform/infrastructure/systemd/helios-isone-rt-hrl-lmps-prelim.timer /etc/systemd/system/
sudo cp /opt/helioscta-platform/infrastructure/systemd/helios-isone-rt-hrl-lmps-final.service /etc/systemd/system/
sudo cp /opt/helioscta-platform/infrastructure/systemd/helios-isone-rt-hrl-lmps-final.timer /etc/systemd/system/
sudo cp /opt/helioscta-platform/infrastructure/systemd/helios-isone-hourly-system-demand.service /etc/systemd/system/
sudo cp /opt/helioscta-platform/infrastructure/systemd/helios-isone-hourly-system-demand.timer /etc/systemd/system/
sudo cp /opt/helioscta-platform/infrastructure/systemd/helios-isone-da-hrl-cleared-demand.service /etc/systemd/system/
sudo cp /opt/helioscta-platform/infrastructure/systemd/helios-isone-da-hrl-cleared-demand.timer /etc/systemd/system/
sudo cp /opt/helioscta-platform/infrastructure/systemd/helios-isone-forecast-batch.service /etc/systemd/system/
sudo cp /opt/helioscta-platform/infrastructure/systemd/helios-isone-forecast-batch.timer /etc/systemd/system/
sudo cp /opt/helioscta-platform/infrastructure/systemd/helios-isone-rt-hrl-scheduled-interchange.service /etc/systemd/system/
sudo cp /opt/helioscta-platform/infrastructure/systemd/helios-isone-rt-hrl-scheduled-interchange.timer /etc/systemd/system/
sudo cp /opt/helioscta-platform/infrastructure/systemd/helios-isone-external-interface-metered-data.service /etc/systemd/system/
sudo cp /opt/helioscta-platform/infrastructure/systemd/helios-isone-external-interface-metered-data.timer /etc/systemd/system/
sudo install -d -m 0755 /etc/systemd/journald.conf.d
sudo cp /opt/helioscta-platform/infrastructure/systemd/journald-helioscta.conf /etc/systemd/journald.conf.d/helioscta.conf
sudo systemctl daemon-reload
sudo systemctl enable --now helios-da-hrl-lmps.timer
sudo systemctl enable --now helios-rt-fivemin-hrl-lmps.timer
sudo systemctl enable --now helios-pjm-rt-hrl-lmps.timer
sudo systemctl enable --now helios-pjm-hourly-price-backfill-7-day.timer
sudo systemctl enable --now helios-pjm-gen-outages-by-type.timer
sudo systemctl enable --now helios-pjm-load-frcstd-7-day.timer
sudo systemctl enable --now helios-pjm-ops-sum.timer
sudo systemctl enable --now helios-ercot-dam-stlmnt-pnt-prices.timer
sudo systemctl enable --now helios-ercot-settlement-point-prices.timer
sudo systemctl enable --now helios-ercot-load-batch.timer
sudo systemctl enable --now helios-ercot-congestion-batch.timer
sudo systemctl enable --now helios-ercot-renewables-batch.timer
sudo systemctl enable --now helios-ercot-renewables-5min-batch.timer
sudo systemctl enable --now helios-ercot-outage-capacity-batch.timer
sudo systemctl enable --now helios-isone-da-hrl-lmps.timer
sudo systemctl enable --now helios-isone-rt-hrl-lmps-prelim.timer
sudo systemctl enable --now helios-isone-rt-hrl-lmps-final.timer
sudo systemctl enable --now helios-isone-hourly-system-demand.timer
sudo systemctl enable --now helios-isone-da-hrl-cleared-demand.timer
sudo systemctl enable --now helios-isone-forecast-batch.timer
sudo systemctl enable --now helios-isone-rt-hrl-scheduled-interchange.timer
sudo systemctl enable --now helios-isone-external-interface-metered-data.timer
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
sudo systemctl start helios-pjm-rt-hrl-lmps.service
sudo systemctl start helios-pjm-hourly-price-backfill-7-day.service
sudo systemctl start helios-pjm-gen-outages-by-type.service
sudo systemctl start helios-pjm-load-frcstd-7-day.service
sudo systemctl start helios-pjm-ops-sum.service
sudo systemctl start helios-ercot-dam-stlmnt-pnt-prices.service
sudo systemctl start helios-ercot-settlement-point-prices.service
sudo systemctl start helios-ercot-load-batch.service
sudo systemctl start helios-ercot-congestion-batch.service
sudo systemctl start helios-ercot-renewables-batch.service
sudo systemctl start helios-ercot-renewables-5min-batch.service
sudo systemctl start helios-ercot-outage-capacity-batch.service
sudo systemctl start helios-isone-da-hrl-lmps.service
sudo systemctl start helios-isone-rt-hrl-lmps-prelim.service
sudo systemctl start helios-isone-rt-hrl-lmps-final.service
sudo systemctl start helios-isone-rt-hrl-scheduled-interchange.service
sudo systemctl start helios-isone-external-interface-metered-data.service
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

For the PJM Operations Summary refresh:

```bash
systemctl status helios-pjm-ops-sum.service
systemctl status helios-pjm-ops-sum.timer
journalctl -u helios-pjm-ops-sum.service -n 200 --no-pager
```

For the PJM generation outages by type refresh:

```bash
systemctl status helios-pjm-gen-outages-by-type.service
systemctl status helios-pjm-gen-outages-by-type.timer
journalctl -u helios-pjm-gen-outages-by-type.service -n 200 --no-pager
```

For the PJM seven-day load forecast refresh:

```bash
systemctl status helios-pjm-load-frcstd-7-day.service
systemctl status helios-pjm-load-frcstd-7-day.timer
journalctl -u helios-pjm-load-frcstd-7-day.service -n 200 --no-pager
```

For the PJM Meteologica forecast refresh:

```bash
systemctl status helios-pjm-meteologica-forecast-hourly.service
systemctl status helios-pjm-meteologica-forecast-hourly.timer
journalctl -u helios-pjm-meteologica-forecast-hourly.service -n 200 --no-pager
```

For the RT verified five-minute HRL LMP workflow:

```bash
systemctl status helios-rt-fivemin-hrl-lmps.service
systemctl status helios-rt-fivemin-hrl-lmps.timer
journalctl -u helios-rt-fivemin-hrl-lmps.service -n 200 --no-pager
```

For the PJM verified hourly RT LMP post-publish refresh:

```bash
systemctl status helios-pjm-rt-hrl-lmps.service
systemctl status helios-pjm-rt-hrl-lmps.timer
journalctl -u helios-pjm-rt-hrl-lmps.service -n 200 --no-pager
```

For the PJM hourly price seven-day backfill repair:

```bash
systemctl status helios-pjm-hourly-price-backfill-7-day.service
systemctl status helios-pjm-hourly-price-backfill-7-day.timer
journalctl -u helios-pjm-hourly-price-backfill-7-day.service -n 240 --no-pager
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

For ISO-NE ISO Express feeds:

```bash
systemctl status helios-isone-da-hrl-lmps.service
systemctl status helios-isone-da-hrl-lmps.timer
journalctl -u helios-isone-da-hrl-lmps.service -n 200 --no-pager
systemctl status helios-isone-rt-hrl-lmps-prelim.service
systemctl status helios-isone-rt-hrl-lmps-prelim.timer
journalctl -u helios-isone-rt-hrl-lmps-prelim.service -n 200 --no-pager
systemctl status helios-isone-rt-hrl-lmps-final.service
systemctl status helios-isone-rt-hrl-lmps-final.timer
journalctl -u helios-isone-rt-hrl-lmps-final.service -n 200 --no-pager
systemctl status helios-isone-hourly-system-demand.service
systemctl status helios-isone-hourly-system-demand.timer
journalctl -u helios-isone-hourly-system-demand.service -n 200 --no-pager
systemctl status helios-isone-da-hrl-cleared-demand.service
systemctl status helios-isone-da-hrl-cleared-demand.timer
journalctl -u helios-isone-da-hrl-cleared-demand.service -n 200 --no-pager
systemctl status helios-isone-forecast-batch.service
systemctl status helios-isone-forecast-batch.timer
journalctl -u helios-isone-forecast-batch.service -n 200 --no-pager
systemctl status helios-isone-rt-hrl-scheduled-interchange.service
systemctl status helios-isone-rt-hrl-scheduled-interchange.timer
journalctl -u helios-isone-rt-hrl-scheduled-interchange.service -n 200 --no-pager
systemctl status helios-isone-external-interface-metered-data.service
systemctl status helios-isone-external-interface-metered-data.timer
journalctl -u helios-isone-external-interface-metered-data.service -n 200 --no-pager
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

## Remove Legacy Or Untracked Timers

Only committed timers in this directory should run on `helioscta-prod-vm-01`.
If production health shows a `helios-*` timer that is not represented by a
`.timer` file here, treat it as untracked deployed code until proven otherwise.

Inspect enabled timers and their commands:

```bash
systemctl list-timers 'helios-*' --all --no-pager
systemctl list-unit-files 'helios-*' --type=timer --no-pager
systemctl cat helios-<workflow>.service
journalctl -u helios-<workflow>.service -n 120 --no-pager
```

For legacy jobs that duplicate promoted feeds or have no documented source/table
contract, stop the timer and leave the service file disabled:

```bash
sudo systemctl disable --now helios-<workflow>.timer
sudo systemctl reset-failed helios-<workflow>.service
systemctl list-timers 'helios-*' --all --no-pager
```

Promote an untracked timer instead of disabling it only when it has an owner,
runtime path, destination table contract, safe rerun behavior, telemetry,
deployment register entry, and targeted verification.
