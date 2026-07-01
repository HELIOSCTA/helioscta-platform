# Backend Runtime

Backend scrape scripts use the `helios_admin` database role. dbt uses separate
read-only credentials under `dbt/azure_postgres`.

## Environment

Create `backend/.env` for local development or set these as process
environment variables:

```text
AZURE_POSTGRES_WRITER_HOST=
AZURE_POSTGRES_WRITER_USER=helios_admin
AZURE_POSTGRES_WRITER_PASSWORD=
AZURE_POSTGRES_WRITER_PORT=5432
AZURE_POSTGRES_WRITER_DBNAME=helios_prod
AZURE_POSTGRES_WRITER_SSLMODE=require

PJM_API_KEY=

ERCOT_USERNAME=
ERCOT_PASSCODE=
ERCOT_API_KEY=

WSI_TRADER_USERNAME=
WSI_TRADER_NAME=
WSI_TRADER_PASSWORD=

XTRADERS_API_USERNAME_ISO=
XTRADERS_API_PASSWORD_ISO=

NAV_SFTP_HOST=
NAV_SFTP_USER=
NAV_SFTP_PASSWORD=
NAV_SFTP_PORT=22
NAV_SFTP_REMOTE_DIR=/
```

Legacy `AZURE_POSTGRESQL_DB_*` variables still work as fallbacks. The backend
environment variable names still say `WRITER`, but the configured database user
is now the app owner role, `helios_admin`.

Production VM jobs should not use `backend/.env`; they consume the root-owned
systemd environment file at `/etc/helioscta/backend.env`. Keep one `KEY=value`
per line and leave the file with a trailing newline so adjacent secrets and
settings cannot be concatenated.

Set `HELIOS_LOG_DIR=/var/log/helioscta` on Linux VMs if you want file logs
outside the git checkout. Without it, scripts write under their local `logs/`
folder.

The script logger writes the same structured sections to the terminal and to a
file. Production systemd jobs should rely on journald for process status and
`/var/log/helioscta` for retained failure logs; successful file logs are
deleted by default when scripts initialize logging with `delete_if_no_errors`.

ERCOT Public API helpers use the existing `ERCOT_USERNAME`,
`ERCOT_PASSCODE`, and `ERCOT_API_KEY` environment variables. The first ERCOT
runtime module is `backend.scrapes.power.ercot.dam_stlmnt_pnt_prices`, backed
by disabled operator SQL under `dbt/azure_postgres/models/power/ercot/`.
Promoted ERCOT schedules run orchestration modules through systemd so API
telemetry and data-readiness events are emitted with the database writes.

ISO-NE ISO Express CSV helpers use public CSV report URLs and do not require
ISO-NE-specific credentials. The promoted ISO-NE runtime modules live under
`backend.scrapes.power.isone` and `backend.orchestration.power.isone`, backed
by disabled operator SQL under `dbt/azure_postgres/models/power/isone/`.
Promoted feeds currently cover DA hourly LMPs, final RT hourly LMPs,
preliminary RT hourly LMPs, hourly system demand, and day-ahead hourly cleared
demand. ISO-NE forecast feeds run through
`backend.orchestration.power.isone.forecast_batch` and cover regional demand,
capacity, wind, and solar forecast CSVs while intentionally excluding
five-minute feeds.
The real-time hourly scheduled interchange workflow runs through
`backend.orchestration.power.isone.rt_hrl_scheduled_interchange` and writes
actual interchange, purchases, and sales by interface.
The external interface metered data workflow runs through
`backend.orchestration.power.isone.external_interface_metered_data` and writes
annual workbook rows for ISO-NE control-area totals and interface-level
metered interchange plus DA/RT price components.

MISO public Real-Time Data API helpers use unauthenticated JSON endpoints from
`https://public-api.misoenergy.org` and do not require MISO-specific
credentials. The first promoted MISO runtime module is
`backend.scrapes.power.miso.real_time_total_load`, with orchestration at
`backend.orchestration.power.miso.real_time_total_load`, backed by disabled
operator SQL under `dbt/azure_postgres/models/power/miso/`. MISO asks public
users to avoid accessing real-time links more than once per minute, so
scheduled jobs should use a conservative cadence.

WSI Trader weather helpers use `WSI_TRADER_USERNAME`, `WSI_TRADER_NAME`, and
`WSI_TRADER_PASSWORD`. The promoted observed runtime module is
`backend.scrapes.weather.wsi.hourly_observed`, with orchestration at
`backend.orchestration.weather.wsi.hourly_observed`. It writes hourly observed
temperature/weather rows to `weather.wsi_hourly_observed_temperatures`, logs
WSI API fetch telemetry to `ops.api_fetch_log`, and emits a weather freshness
event to `ops.data_availability_events`. The source grain is
`station_id x observation_time_local x region`; observations are stored in WSI
local station-hour time, so the availability payload records the local window
instead of UTC interval bounds.

The promoted WSI hourly forecast runtime module is
`backend.scrapes.weather.wsi.hourly_forecast`, with orchestration at
`backend.orchestration.weather.wsi.hourly_forecast`. It writes latest WSI
hourly forecast snapshots to `weather.wsi_hourly_forecasts`, using the source
forecast issue timestamp from the WSI CSV banner and UTC forecast valid hours.
The source grain is
`station_id x region x forecast_issued_at_utc x forecast_time_utc`; safe reruns
upsert by that key while preserving distinct forecast issues. Scheduled runs
retain 90 days of forecast issue history in the hot table and purge older rows
after successful upserts.

Forecast hot-table retention is enforced by the scrape runtime after successful
upserts for rolling forecast tables: ERCOT seven-day load forecasts, ISO-NE
regional demand/capacity/wind/solar forecasts, PJM seven-day load, hourly
solar/wind, WSI hourly forecasts, and Meteologica PJM hourly forecasts.
Retention is keyed to the source issue, publication, or evaluation timestamp so
the table keeps 90 days of forecast vintages. Historical PJM Data Miner
`pjm.load_frcstd_hist` and outage forecast tables remain indefinite unless
operators explicitly decide to truncate archive history.

PJM Data Miner Operations Summary helpers run through
`backend.orchestration.power.pjm.ops_sum` and write
`ops_sum_frcstd_tran_lim`, `ops_sum_frcst_peak_area`,
`ops_sum_frcst_peak_rto`, `ops_sum_prev_period`, and
`ops_sum_prjctd_tie_flow` to the `pjm` schema. They log API telemetry to
`ops.api_fetch_log` and retain `generated_at_ept` as the PJM source freshness
timestamp. Upsert keys use the projected or operating interval plus the feed
dimension, so the 05:05, 06:05, 07:05, and 08:05 EPT runs overwrite the same
current-day rows as PJM refreshes them. `ops_sum_prev_period` contains sparse
peak/valley historical rows before 2017-05-31 and complete hourly-by-area rows
from 2017-05-31 forward.

PJM hourly demand bids run through
`backend.orchestration.power.pjm.hrl_dmd_bids` and write
`pjm.hrl_dmd_bids`. The scheduled path polls PJM Data Miner `hrl_dmd_bids` for
the next market day every two minutes for up to four hours, starting one hour
after the DA hourly LMP timer, then upserts by
`datetime_beginning_utc x datetime_beginning_ept x area` and logs one resolved
API fetch telemetry row to `ops.api_fetch_log`.

PJM day-ahead transmission constraints run through
`backend.orchestration.power.pjm.da_transconstraints` and write
`pjm.da_transconstraints`. The scheduled path uses the same daily start and
polling policy as hourly demand bids, then upserts by
`datetime_beginning_utc x day_ahead_congestion_event x monitored_facility x
contingency_facility` and logs one resolved API fetch telemetry row to
`ops.api_fetch_log`.

PJM simple hourly refreshes run through the hourly bucket at
`backend.orchestration.power.pjm.hourly_bucket`. It includes
`backend.orchestration.power.pjm.rt_unverified_hrl_lmps`, which writes
`pjm.rt_unverified_hrl_lmps`, and
`backend.orchestration.power.pjm.gen_by_fuel`, which writes
`pjm.gen_by_fuel`. The scheduled path refreshes rolling recent windows hourly,
logs PJM API telemetry to `ops.api_fetch_log`, and uses the existing
primary-key upserts. Unverified RT hourly LMPs are not settlement quality and
remain subject to later PJM verification; the verified hourly and five-minute
RT LMP tables remain the settlement-quality paths.

Meteologica xTraders helpers use the existing
`XTRADERS_API_USERNAME_ISO` and `XTRADERS_API_PASSWORD_ISO` environment
variables. The promoted PJM forecast runtime module is
`backend.scrapes.power.pjm.meteologica_forecast_hourly`, with orchestration at
`backend.orchestration.power.pjm.meteologica_forecast_hourly`. The scheduled
orchestration writes load, solar, and wind hourly forecasts for PJM `RTO`,
`MIDATL`, `SOUTH`, and `WEST` into `meteologica.pjm_forecast_hourly`, then
runs the PJM Meteologica DA price refresh. Both legs log Meteologica API
telemetry to `ops.api_fetch_log` and emit forecast freshness events to
`ops.data_availability_events`. The source grain is
`content_id x update_id x forecast_period_start`; safe reruns upsert by that
key. Scheduled runs retain 90 days of forecast issue history in the hot tables,
keep DA price rows to a 14-day forward horizon from each source issue, and
purge older rows after successful upserts. Hydro is excluded from v1 because
no PJM hydro forecast content ID is promoted.

The PJM Meteologica DA price runtime module is
`backend.scrapes.power.pjm.meteologica_da_price_forecast`, with orchestration
at `backend.orchestration.power.pjm.meteologica_da_price_forecast` for manual
repair runs and for composition by the scheduled Meteologica forecast
orchestration. It writes Western Hub deterministic DA price forecasts and
ECMWF ENS DA price forecasts directly to
`meteologica.usa_pjm_western_hub_da_power_price_forecast_hourly` and
`meteologica.usa_pjm_western_hub_da_power_price_forecast_ecmwf_ens_hourly`,
using the same source grain. Incoming and existing DA price rows are limited to
14 days forward from the source issue timestamp in the source timezone.

ICE Python settlement helpers are local Windows-only. They live under
`backend.scrapes.ice_python` and `backend.orchestration.ice_python`, write
non-option settlement marks to `ice_python.settlements` and contract-date
snapshots to `ice_python.settlement_contract_dates`, and require a licensed ICE
XL / ICE Python install on the Windows scheduler host. Do not install ICE
dependencies from `backend/requirements-local-windows.txt` on the Linux VM,
and do not add ICE systemd units under `infrastructure/systemd`.
The local Windows Task Scheduler coordinator runs the ICE scheduler in
`run_once` mode, launches due jobs in child Python processes with hard
timeouts, prevents overlapping manual/scheduled pulls with a local lock file,
persists per-window state with explicit success/failure/timeout statuses, and
writes durable job telemetry to `ops.api_fetch_log`.

NAV position helpers are local SFTP workflows. They live under
`backend.scrapes.nav` and `backend.orchestration.nav`, write normalized NAV
position valuation snapshots to `nav.positions`, and use the existing
`NAV_SFTP_*` environment variables. The v1 activation path is a manual local
run with `python -m backend.orchestration.nav.positions`; do not add NAV
systemd units unless the workflow is explicitly promoted to the Linux VM.

NOAA AviationWeather METAR helpers use the public
`https://aviationweather.gov/api/data/metar` endpoint and do not require
provider credentials. The runtime module is
`backend.scrapes.weather.noaa.metar_observations`, with orchestration at
`backend.orchestration.weather.noaa.metar_observations`. It writes
frontend-facing realtime observations to `weather.noaa_metar_observations`,
logs API fetch telemetry to `ops.api_fetch_log`, and emits weather freshness
events to `ops.data_availability_events`. The source grain is
`station_id x observation_time_utc`.

## Permissions Contract

Application schemas, shared platform tables, and promoted direct-write feed
tables are documented as disabled dbt operator SQL under
`dbt/azure_postgres/models/`. Backend scripts assume those objects exist and
only perform application writes.

Scheduled orchestration that emits API telemetry or data-availability events
also assumes the shared `ops.api_fetch_log` and `ops.data_availability_events`
tables have been applied by operator SQL before the timer is enabled.

After the Azure Postgres permission defaults have been installed, new schemas
and tables created by `helios_admin` inherit the expected read-only grants
automatically.

## Dependencies

For VM runtime jobs:

```bash
pip install -r backend/requirements.txt -e backend
```

For dbt compilation:

```bash
pip install -r backend/requirements-dbt.txt
```

For local tests:

```bash
pip install -r backend/requirements-dev.txt -e backend
pytest backend/tests
```

For local Windows ICE Python runs only:

```powershell
python -m pip install -r backend\requirements-local-windows.txt -e backend
```

Install the proprietary ICE Python wheel from the licensed ICE XL installation
outside this repo, set `HELIOS_LOG_DIR=C:\ProgramData\HeliosCTA\logs`, and
install the local Windows Task Scheduler coordinator from
`infrastructure/windows-task-scheduler/`.

For local NAV SFTP runs only:

```powershell
python -m pip install -r backend\requirements-local-sftp.txt -e backend
python -m backend.orchestration.nav.positions
```

## Manual PJM Backfills

PJM backfills are Python module entry points that call the same production
scrape/orchestration `main()` functions as the scheduled jobs, then rely on the
existing primary-key upserts for safe reruns.

Default module runs backfill one recent market day:

```bash
python -m backend.backfills.power.pjm.da_hrl_lmps
python -m backend.backfills.power.pjm.rt_hrl_lmps
python -m backend.backfills.power.pjm.rt_unverified_hrl_lmps
python -m backend.backfills.power.pjm.hrl_load_metered
python -m backend.backfills.power.pjm.hrl_load_prelim
python -m backend.backfills.power.pjm.gen_outages_by_type
python -m backend.backfills.weather.wsi.hourly_observed
```

For an ad hoc range, edit the `DEFAULT_START_DATE`, `DEFAULT_END_DATE`, or the
bottom `main(...)` call in the target module before running it on the VM. The
wrappers validate the requested window, support `dry_run=True`, and stamp API
fetch telemetry with backfill metadata where the underlying scrape supports it.
WSI hourly observed backfills call the existing weather orchestration path, so
successful runs also emit the current WSI freshness event. Use the read-only
coverage SQL in `docs/operations/manual-backfills.md` before handing historical
coverage to frontend consumers.

## Scheduled PJM Price Repair

`backend.orchestration.power.pjm.hourly_price_backfill_7_day` runs a nightly
seven-day repair over the promoted PJM LMP price tables:

- `pjm.da_hrl_lmps`
- `pjm.rt_hrl_lmps`
- `pjm.rt_fivemin_hrl_lmps`
- `pjm.rt_unverified_hrl_lmps`

The VM timer is `helios-pjm-hourly-price-backfill-7-day.timer`, scheduled at
`02:00 America/New_York`. It uses feed-specific publication lags: DA through
the current PJM market date, unverified RT hourly through the prior market
date, and verified RT hourly and verified RT five-minute through two market
dates back. Each underlying backfill writes
`run_mode=backfill` metadata to `ops.api_fetch_log` and uses the existing
primary-key upsert path. The verified RT five-minute repair also emits the
same complete-day readiness events as its dedicated scheduled workflow.
