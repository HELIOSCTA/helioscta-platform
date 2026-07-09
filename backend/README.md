# Backend Runtime

Backend scrape scripts use the `helios_admin` database role. Frontend and
inspection paths use separate read-only credentials.

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

HELIOS_EMAIL_NOTIFICATIONS_ENABLED=false
HELIOS_EMAIL_RECIPIENTS=aidan.keaveny@helioscta.com
HELIOS_EMAIL_FRONTEND_BASE_URL=https://frontend-helioscta.vercel.app
HELIOS_EMAIL_MAX_ATTEMPTS=6
HELIOS_EMAIL_STALE_SENDING_MINUTES=30
AZURE_OUTLOOK_CLIENT_ID=
AZURE_OUTLOOK_TENANT_ID=
AZURE_OUTLOOK_CLIENT_SECRET=
AZURE_OUTLOOK_SENDER=aidan.keaveny@helioscta.com

HELIOS_SLACK_NOTIFICATIONS_ENABLED=false
HELIOS_SLACK_MAX_ATTEMPTS=6
HELIOS_SLACK_STALE_SENDING_MINUTES=30
SLACK_BOT_TOKEN=
SLACK_DEFAULT_CHANNEL_ID=C0BEDBTAL2H
SLACK_DEFAULT_CHANNEL_NAME=#helios-alerts-power
SLACK_POWER_ALERTS_CHANNEL_ID=C0BEDBTAL2H
SLACK_POWER_ALERTS_CHANNEL_NAME=#helios-alerts-power
SLACK_POSITIONS_TRADES_ALERTS_CHANNEL_ID=
SLACK_POSITIONS_TRADES_ALERTS_CHANNEL_NAME=#helios-alerts-positions-trades
SLACK_DEFAULT_WEBHOOK_URL=

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

CLEAR_STREET_SFTP_HOST=
CLEAR_STREET_SFTP_USER=
CLEAR_STREET_SFTP_PORT=22
CLEAR_STREET_SFTP_REMOTE_DIR=/
CLEAR_STREET_SSH_KEY_CONTENT=

MUFG_SFTP_HOST=
MUFG_SFTP_USER=
MUFG_SFTP_PASSWORD=
MUFG_SFTP_PORT=22
MUFG_SFTP_REMOTE_DIR=/
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
runtime module is `backend.scrapes.power.ercot.dam_stlmnt_pnt_prices`. Its
target tables must exist before scheduled writers run.
Promoted ERCOT schedules run orchestration modules through systemd so API
telemetry and data-readiness events are emitted with the database writes.

ISO-NE ISO Express CSV helpers use public CSV report URLs and do not require
ISO-NE-specific credentials. The promoted ISO-NE runtime modules live under
`backend.scrapes.power.isone` and `backend.orchestration.power.isone`. Their
target tables must exist before scheduled writers run.
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
`backend.orchestration.power.miso.real_time_total_load`. MISO asks public users
to avoid accessing real-time links more than once per minute, so
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

PJM day-ahead reserve market results run through
`backend.orchestration.power.pjm.da_reserve_market_results` and write
`pjm.da_reserve_market_results`. The VM timer
`helios-pjm-da-reserve-market-results.timer` runs daily at `13:45
America/New_York`, after the observed day-ahead ancillary service market
publication window. The scheduled path polls PJM Data Miner
`da_reserve_market_results` for the current PJM/Eastern market date every two
minutes for up to four hours, then upserts by
`datetime_beginning_utc x locale x service`, logs one resolved API fetch
telemetry row to `ops.api_fetch_log`, emits a complete day readiness event,
and queues one Slack release notification.

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
`backend.scrapes.nav` and `backend.orchestration.nav`, write raw NAV position
valuation snapshots to `nav.positions`, and use the existing `NAV_SFTP_*`
environment variables. `nav.positions` stores the source workbook fields plus
file/fund metadata only. Product-code, product-group, contract,
instrument-type, and normalization-status fields are derived by read-only SQL
at query time, not persisted in the source table. The active runtime is the
local Windows Task Scheduler job installed from
`infrastructure/windows-task-scheduler/install_nav_positions_task.ps1`; do not
add NAV systemd units unless the workflow is explicitly promoted to the Linux
VM. Downloaded raw NAV workbooks are cached under
`backend/scrapes/nav/downloads/` by default and that folder is gitignored. The
downloader preserves already-cached workbooks instead of overwriting them,
because NAV source files can expire upstream. The scheduled path runs daily at
local hour `06` by default, uses a five-file lookback per fund, writes
`operation_name = 'nav_positions_scheduled'` telemetry to `ops.api_fetch_log`,
and exits nonzero if no source rows are processed.

NAV trade break helpers are local SFTP/email workflows. They live under
`backend.scrapes.nav.trade_breaks` and
`backend.orchestration.nav.trade_breaks_email`, use the existing `NAV_SFTP_*`
and `AZURE_OUTLOOK_*` variables, and do not upsert trade break rows to a
database table. The manual local run is
`python -m backend.orchestration.nav.trade_breaks_email`; it downloads the
latest matching NAV Trade Breaks workbook into
`backend/scrapes/nav/downloads/trade_breaks/`, sends that workbook as an email
attachment to `HELIOS_EMAIL_RECIPIENTS`, and writes one failure-visibility row
to `ops.api_fetch_log` with target `nav_email.nav_trade_breaks`.

Clear Street end-of-day transaction helpers are local SFTP workflows. They live
under `backend.scrapes.clear_street` and `backend.orchestration.clear_street`,
write raw transaction rows to `clear_street.eod_transactions`, and use the
existing `CLEAR_STREET_SFTP_*` variables plus `CLEAR_STREET_SSH_KEY_CONTENT`
for RSA key authentication. The source grain is `trade_date_from_sftp x
sftp_upload_timestamp x source row number`; safe reruns upsert by that key
while preserving separate Clear Street uploads for the same trade date. The
initial activation path is a manual local run with
`python -m backend.orchestration.clear_street.transactions`; do not add Clear
Street systemd units unless the workflow is explicitly promoted to the Linux
VM. Downloaded raw CSVs are cached under
`backend/scrapes/clear_street/downloads/` by default and that folder is
gitignored. The local Windows Task Scheduler path starts one scheduled poll at
19:00 local time, checks every five minutes for that window's target
trade-date file, and exits successfully as soon as the file is processed or
fails at 05:00 local time. Successful runs enqueue one duplicate-safe Slack
outbox row for the latest loaded source trade file only, not for downstream SQL
readiness. The alert routes to the positions/trades Slack channel when
configured, falling back to the default Slack channel; timeout alerts enqueue
to the same positions/trades channel. Actual posting still depends on
`HELIOS_SLACK_NOTIFICATIONS_ENABLED=true` and Slack bot/webhook credentials.
Successful source-file loads also enqueue an internal email to
`HELIOS_EMAIL_RECIPIENTS` with the downloaded raw Clear Street CSV attached;
delivery depends on `HELIOS_EMAIL_NOTIFICATIONS_ENABLED=true` and Microsoft
Graph credentials. Attachment paths are stored in the email outbox payload, so
cached CSVs must remain available until the email sender processes the row.
After the source file loads, the scheduled path runs the MUFG upload leg from
`backend.orchestration.positions_and_trades.clear_street_mufg_upload`. That
leg reads the generated read-only SQL at
`backend/scrapes/positions_and_trades/generated_sql/clear_street_trades_mufg_latest.sql`,
uses the Clear Street target trade date for the exported
`Helios_Transactions_YYYYMMDD_filtered.csv` filename when available, uploads
the CSV to MUFG SFTP, logs separate `ops.api_fetch_log` telemetry with
`provider = 'mufg_sftp'`, and posts positions/trades Slack success or failure
notifications. When a MUFG output row has blank/null `product_code_grouping`,
blank/null `product_code_region`, and at least one blank/null vendor product
code among `ice_product_code`, `cme_product_code`, or `bbg_product_code`, the
leg queues a separate positions/trades Slack warning listing the affected
source products and their Clear Street identifiers, with per-column counts in
the payload for matching rows. The scheduler's only freshness gate is the
arrival and load of the target Clear Street source file. MUFG upload success
also enqueues an internal email to `HELIOS_EMAIL_RECIPIENTS` with the generated
filtered MUFG CSV attached; the email body includes any MUFG-side warnings such
as empty extract, SQL `sftp_date` mismatch, non-ok `trade_status`, or product
mapping issues. These conditions are recorded in metadata for diagnosis instead
of blocking the v1 upload.

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
tables must exist before backend writers run. Backend scripts assume those
objects exist and only perform application writes.

Scheduled orchestration that emits API telemetry or data-availability events
also assumes the shared `ops.api_fetch_log` and `ops.data_availability_events`
tables have been applied by application DDL before the timer is enabled.

Email notification utilities use `ops.email_notification_outbox` for durable
retry and duplicate suppression. Backend-generated HTML bodies should use the
shared table-based helpers in `backend.utils.email_templates`, keep a plain-text
fallback, escape dynamic values, and avoid external CSS or remote images so
Microsoft Outlook rendering remains predictable. Subjects should keep the
human-readable message first, format visible subject dates as `DDD MMM-DD`, and
append Outlook organization tags with pipe separators, for example
`Clear Street MUFG upload complete for Wed Jul-08 | HeliosCTA | Clear Street |
MUFG Upload | Warning`. The DA HRL LMP scheduled
workflow does not enqueue release emails. The Clear Street source and MUFG
handoff paths do enqueue internal emails with CSV attachments to
`HELIOS_EMAIL_RECIPIENTS` when email notifications are enabled.

Slack notifications use `ops.slack_notification_outbox` for the same durable
retry and duplicate-suppression pattern. The Slack sender posts through
`SLACK_BOT_TOKEN` with Slack `chat.postMessage` and only sends when
`HELIOS_SLACK_NOTIFICATIONS_ENABLED=true`; `SLACK_DEFAULT_WEBHOOK_URL` is kept
as a fallback path, not the preferred production path. The PJM DA HRL LMP,
verified RT HRL LMP, verified RT five-minute HRL LMP, and DA reserve market
results scheduled workflows enqueue one Slack notification to
`#helios-alerts-power` after the target market date is complete and the scrape
has succeeded. Each notification key is derived from the
`ops.data_availability_events.event_key`, so reruns do not duplicate the
channel message. Clear Street EOD transaction runs enqueue a source-file-loaded
notification to `#helios-alerts-positions-trades` through
`SLACK_POSITIONS_TRADES_ALERTS_CHANNEL_ID` when set. The composed Clear Street
to MUFG workflow also enqueues MUFG upload success/failure notifications to the
same positions/trades channel.

After the Azure Postgres permission defaults have been installed, new schemas
and tables created by `helios_admin` inherit the expected read-only grants
automatically.

## Dependencies

For VM runtime jobs:

```bash
pip install -r backend/requirements.txt -e backend
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

For local SFTP runs only:

```powershell
python -m pip install -r backend\requirements-local-sftp.txt -e backend
python -m backend.orchestration.nav.positions
.\infrastructure\windows-task-scheduler\install_nav_positions_task.ps1 `
  -RepoRoot C:\Users\AidanKeaveny\helioscta-prod\helioscta-platform `
  -PythonExe C:\Users\AidanKeaveny\miniconda3\envs\helioscta-azure-backend\python.exe `
  -LogDir C:\Users\AidanKeaveny\helioscta-prod\logs `
  -InstallDependencies `
  -RunImportSmoke
python -m backend.orchestration.nav.trade_breaks_email
python -m backend.orchestration.clear_street.transactions
.\infrastructure\windows-task-scheduler\install_clear_street_task.ps1 `
  -RepoRoot C:\Users\AidanKeaveny\helioscta-prod\helioscta-platform `
  -PythonExe C:\Users\AidanKeaveny\miniconda3\envs\helioscta-azure-backend\python.exe `
  -LogDir C:\Users\AidanKeaveny\helioscta-prod\logs `
  -StateDir C:\Users\AidanKeaveny\helioscta-prod\state `
  -InstallDependencies `
  -RunImportSmoke
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
