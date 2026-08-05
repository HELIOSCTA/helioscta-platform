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

DBT_POSTGRES_HOST=
DBT_POSTGRES_READONLY_USER=helios_readonly
DBT_POSTGRES_READONLY_PASSWORD=
DBT_POSTGRES_PORT=5432
DBT_POSTGRES_DBNAME=helios_prod
DBT_POSTGRES_SSLMODE=require

PJM_API_KEY=
EIA_API_KEY=
MISO_DATA_EXCHANGE_SUBSCRIPTION_KEY=

HELIOS_EMAIL_NOTIFICATIONS_ENABLED=false
HELIOS_EMAIL_RECIPIENTS=aidan.keaveny@helioscta.com,Kapil.Saxena@HeliosCTA.com
HELIOS_EMAIL_FRONTEND_BASE_URL=https://frontend-helioscta.vercel.app
HELIOS_EMAIL_MAX_ATTEMPTS=6
HELIOS_EMAIL_STALE_SENDING_MINUTES=30
AZURE_OUTLOOK_CLIENT_ID=
AZURE_OUTLOOK_TENANT_ID=
AZURE_OUTLOOK_CLIENT_SECRET=
AZURE_OUTLOOK_SENDER=aidan.keaveny@helioscta.com

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

BBG_HOST=localhost
BBG_PORT=8194
```

Legacy `AZURE_POSTGRESQL_DB_*` variables still work as fallbacks. The backend
environment variable names still say `WRITER`, but the configured database user
is now the app owner role, `helios_admin`.

The production health digest also runs the dbt
`tag:positions_trades_product_matching` suite
under `dbt/azure_postgres`. Keep `DBT_POSTGRES_READONLY_USER` and
`DBT_POSTGRES_READONLY_PASSWORD` configured with the read-only role; host,
port, database, and SSL mode can mirror the writer connection. The VM service
user should have the `dbt` CLI installed in the same Python environment as the
health digest, or otherwise available on `PATH`, for exact dbt suite execution.
If dbt is unavailable or not configured, the digest falls back to the packaged
generated all-history SQL and fails on the same unresolved product statuses
using the backend Postgres connection.

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
The ERCOT price-adder support batch runs through
`backend.orchestration.power.ercot.price_adders_batch`, executes
`rt_price_adders_sced` and `rt_price_adders_15min`, and defaults to the prior
complete `America/Chicago` market date for daily VM runs.

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

CAISO OASIS helpers use public `SingleZip` CSV report URLs and do not require
CAISO-specific credentials. The promoted CAISO runtime modules live under
`backend.scrapes.power.caiso` and `backend.orchestration.power.caiso`. Their
target tables must exist before scheduled writers run. Initial feeds cover
NP15/SP15 trading-hub day-ahead hourly LMPs in `caiso.da_lmps` and real-time
five-minute LMPs in `caiso.rt_lmps`, using OASIS nodes
`TH_NP15_GEN-APND` and `TH_SP15_GEN-APND`. Source component rows are normalized
to total, energy, congestion, loss, and GHG price columns at
`interval_start_time_utc x node_id x market_run_id` grain. Runs log OASIS API
fetch telemetry to `ops.api_fetch_log` and orchestration emits complete-day
readiness events for the selected trading hubs.
Historical CAISO OASIS files older than the recent `SingleZip` retention
window are served from CAISO's Historical OASIS Data Downloader and a
requester-pays S3 bucket. The historical loader requires
`AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, optional `AWS_SESSION_TOKEN`, and
`AWS_DEFAULT_REGION=us-west-1` in the runtime environment before real writes.
If CAISO's bulk metadata endpoint does not present a complete TLS chain to the
VM, set `CAISO_BULK_CA_BUNDLE` or `REQUESTS_CA_BUNDLE` to a trusted CA bundle
that includes the missing intermediate plus standard public roots.
The CAISO DA hourly LMP production path is
`backend.orchestration.power.caiso.da_lmps`, with manual backfills at
`backend.backfills.power.caiso.da_lmps`. The VM timer is
`helios-caiso-da-lmps.timer`, scheduled daily at `12:00 America/Los_Angeles`,
one hour before CAISO's published 1:00 p.m. day-ahead results window. The
scheduled path polls until the complete next trading date is available. The CAISO RT
five-minute LMP production path is
`backend.orchestration.power.caiso.rt_lmps`; `helios-caiso-rt-lmps.timer`
runs daily at `09:20 America/Los_Angeles` and defaults to the previous
complete Pacific trading date.

MISO public Real-Time Data API helpers use unauthenticated JSON endpoints from
`https://public-api.misoenergy.org` and do not require MISO-specific
credentials. The first promoted MISO runtime module is
`backend.scrapes.power.miso.real_time_total_load`, with orchestration at
`backend.orchestration.power.miso.real_time_total_load`. MISO asks public users
to avoid accessing real-time links more than once per minute, so
scheduled jobs should use a conservative cadence.
MISO Data Exchange Pricing API LMP helpers require
`MISO_DATA_EXCHANGE_SUBSCRIPTION_KEY` in the backend-only environment. Promoted
LMP paths are `backend.orchestration.power.miso.da_lmps`,
`backend.orchestration.power.miso.rt_lmps_prelim`, and
`backend.orchestration.power.miso.rt_lmps_final`. They write `miso.da_lmps`,
`miso.rt_lmps_prelim`, and `miso.rt_lmps_final` at
`interval_start_time_utc x node_id x market_run_id` grain for
`INDIANA.HUB` plus the additional ICE/MISO hub family. Rows store total LMP,
energy, congestion, and loss components and use `ops.api_fetch_log` plus
complete-day readiness events for scheduled runs. The scheduled MISO DA LMP
workflow queues the shared inline DA release email after complete-day
readiness.

SPP Portal LMP helpers use public file-browser CSV downloads and do not require
SPP-specific credentials. Promoted SPP LMP paths are
`backend.orchestration.power.spp.da_lmps` and
`backend.orchestration.power.spp.rt_lmps_prelim`. They write `spp.da_lmps`
and `spp.rt_lmps_prelim` at
`interval_start_time_utc x node_id x market_run_id` grain for `SPPNORTH_HUB`
and `SPPSOUTH_HUB`. Rows store total LMP, energy, congestion, and loss
components and use `ops.api_fetch_log` plus complete-day readiness events for
scheduled runs. The scheduled SPP DA LMP workflow queues the shared inline DA
release email after complete-day readiness.

NYISO MIS LBMP helpers use public daily zonal CSV files and do not require
NYISO-specific credentials. Promoted NYISO LBMP paths are
`backend.orchestration.power.nyiso.da_lmps` and
`backend.orchestration.power.nyiso.rt_lmps_prelim`. They write
`nyiso.da_lmps` and `nyiso.rt_lmps_prelim` at
`interval_start_time_utc x node_id x market_run_id` grain for the 11 public
NYISO load zones. Rows retain `ptid`, store total LBMP, derive energy as total
minus loss minus congestion, and use `ops.api_fetch_log` plus complete-day
readiness events for scheduled runs. The scheduled NYISO DA LBMP workflow
queues the shared inline DA release email after complete-day readiness.

EIA Open Data API helpers use `EIA_API_KEY`. Promoted EIA runtime modules live
under `backend.scrapes.eia`, with orchestration at `backend.orchestration.eia`
and manual backfills at `backend.backfills.eia`.
Scheduled EIA orchestration modules are release-aware pollers: scheduled runs
wait for the target period to appear before upserting, while backfill and test
runs stay single-shot by default so historical replays do not block.
The EIA-930 daily fuel-mix source used for website-style daily views runs
through `backend.scrapes.eia.eia_930_daily_generation_by_fuel`, with
orchestration at
`backend.orchestration.eia.eia_930_daily_generation_by_fuel` and manual
backfills at
`backend.backfills.eia.eia_930_daily_generation_by_fuel`. It writes raw daily
rows to `eia.eia_930_daily_generation_by_fuel` at
`period x respondent x fueltype x timezone` grain, preserving the EIA response
field names after SQL-safe hyphen replacement (`respondent_name`, `type_name`,
and `timezone_description`). The timezone key is required because the public
EIA daily endpoint returns multiple timezone variants for a single
`period x respondent x fueltype`; curated website marts should choose a
canonical timezone before renaming fields for Edi-style
`DATE x RESPONDENT x FUELTYPE` tables. Schedule the daily orchestrator after
the public daily refresh window, around `07:30 America/New_York`; it targets
the prior Eastern date, polls every 15 minutes for up to 4.5 hours, and
refreshes a 31-day rolling source window so late EIA revisions overwrite prior
raw rows.
The companion EIA-930 daily region-data source runs through
`backend.scrapes.eia.eia_930_daily_region_data`, with orchestration at
`backend.orchestration.eia.eia_930_daily_region_data` and manual backfills at
`backend.backfills.eia.eia_930_daily_region_data`. It writes raw daily rows to
`eia.eia_930_daily_region_data` at `period x respondent x type x timezone`
grain, preserving EIA `D` demand, `DF` day-ahead demand forecast, `NG` net
generation, and `TI` total interchange type values. The EIA dashboard consumes
`D` from this table for true demand; total generation is summed from
generation-by-fuel rows, not derived from demand rows. Schedule the daily
orchestrator around the same public daily refresh window, at
`07:35 America/New_York`; it targets the prior Eastern date, polls every 15
minutes for up to 4.5 hours, and refreshes a 31-day rolling source window so
late EIA revisions overwrite prior raw rows.
Weekly natural gas underground storage runs through
`backend.scrapes.eia.weekly_underground_storage`, with orchestration at
`backend.orchestration.eia.weekly_underground_storage` and manual backfills at
`backend.backfills.eia.weekly_underground_storage`. It writes
weekly storage rows to `eia.weekly_underground_storage` at
`eia_week_ending x series` grain, preserving EIA source dimensions such as
`duoarea`, `process`, and `series` while storing parsed `region` as a
convenience column. Schedule it around the Thursday `10:30 America/New_York`
release; it targets the prior Friday week-ending date and polls every 2
minutes for up to 90 minutes until the expected storage series are present.
Monthly natural gas consumption by end use runs through
`backend.scrapes.eia.nat_gas_consumption_end_use_monthly`, with
orchestration at
`backend.orchestration.eia.nat_gas_consumption_end_use_monthly` and manual
backfills at
`backend.backfills.eia.nat_gas_consumption_end_use_monthly`. It writes
monthly consumption rows to `eia.nat_gas_consumption_end_use_monthly` at
`report_month x series` grain, preserving EIA area, product, and end-use
process dimensions while storing volumes in `value_mmcf`. Schedule it on the
Natural Gas Monthly last-business-day afternoon release; it targets the
two-month-lag report month and polls every 30 minutes for up to 6 hours.

WSI Trader weather helpers use `WSI_TRADER_USERNAME`, `WSI_TRADER_NAME`, and
`WSI_TRADER_PASSWORD`. The promoted observed runtime module is
`backend.scrapes.weather.wsi.hourly_observed`, with orchestration at
`backend.orchestration.weather.wsi.hourly_observed`. It writes hourly observed
temperature/weather rows to `weather.wsi_hourly_observed_temperatures`, logs
WSI API fetch telemetry to `ops.api_fetch_log`, and emits a weather freshness
event to `ops.data_availability_events`. The source grain is
`station_id x observation_time_local x region`; observations are stored in WSI
local station-hour time, so the availability payload records the local window
instead of UTC interval bounds. WSI CSV parse and required-column failures emit
an additional failed `ops.api_fetch_log` row with
`metadata.telemetry_stage = 'parse_csv'` after the HTTP fetch row, so malformed
HTTP 200 responses are visible in fetch telemetry. The freshness event marks
`completeness_status = 'complete'` only when every configured station in the
region basket is present; otherwise it emits `partial` with expected, actual,
missing, and unexpected station IDs in the payload.

The promoted WSI hourly forecast runtime module is
`backend.scrapes.weather.wsi.hourly_forecast`, with orchestration at
`backend.orchestration.weather.wsi.hourly_forecast`. It writes latest WSI
hourly forecast snapshots to `weather.wsi_hourly_forecasts`, using the source
forecast issue timestamp from the WSI CSV banner and UTC forecast valid hours.
The source grain is
`station_id x region x forecast_issued_at_utc x forecast_time_utc`; safe reruns
upsert by that key while preserving distinct forecast issues. Scheduled runs
retain 90 days of forecast issue history in the hot table and purge older rows
after successful upserts. Forecast parse failures emit a failed
`ops.api_fetch_log` row with
`metadata.telemetry_stage = 'parse_forecast_csv'`. Forecast freshness marks
`complete` only when every configured station is present and each station has a
uniform count of forecast valid hours; otherwise it emits `partial`.

The promoted WSI daily weighted forecast runtime modules are
`backend.scrapes.weather.wsi.daily_weighted_temperature_forecast` and
`backend.scrapes.weather.wsi.daily_weighted_degree_day_forecast`, with combined
orchestration at `backend.orchestration.weather.wsi.daily_weighted_forecasts`.
They write forecast-only daily weighted rows from WSI Trader `GetModelForecast`
and `GetWeightedDegreeDayForecast` to
`weather.wsi_daily_weighted_temperature_forecasts` and
`weather.wsi_daily_weighted_degree_day_forecasts`. The source grain for both
tables is
`source_issue_key x model x forecast_type x request_region x entity_id x
forecast_date x metric_name`; safe reruns upsert by that key while preserving
distinct source forecast issues. Weighted temperatures default to North America,
WSI model, daily resolution, Fahrenheit temperature units, uncorrected model
bias, and all NA weighted-temperature regions returned by WSI
`allregions=true`. Weighted degree days default to North America, daily
resolution, raw output without bias correction for the WSI, GFS_OP, GFS_ENS,
ECMWF_OP, ECMWF_ENS, AIFS, and AIFS_ENS models, and all nine weighted
degree-day regions accepted by the forecast endpoint. WSI weighted degree-day
output uses the original 32 metric shape; the model-driven feeds use the
72-metric shape returned by WSI, including 6-hour difference columns. Both
scrapes log WSI API fetch telemetry to `ops.api_fetch_log`; malformed or
schema-incompatible CSV after HTTP success adds a failed parse-stage fetch row.
The raw weighted degree-day table also stores nullable model-run metadata from
the source rows: `source_model`, `source_init_at_utc`, `source_init_cycle`,
`model_run_cycle`, and `forecast_day`. The combined orchestration remains the
temperature plus WSI-baseline refresh path. Model-driven weighted degree-day
forecasts run through per-model/per-cycle pollers that check every three
minutes for up to two hours until the expected 00Z or 12Z source init cycle has
all configured entities, model-specific expected metrics, and 15 consecutive
daily forecast dates; complete snapshots upsert immediately once detected.
Timeout or wrong-cycle responses
write resolved poll telemetry to `ops.api_fetch_log`, emit a partial freshness
event when source context is available, and leave partial rows out of the raw
table. Scheduled runs retain 90 days of weighted-temperature source issues and
30 days of weighted degree-day source issues in the hot tables after successful
upserts, using `source_issue_at_utc` when WSI publishes it and
`scrape_run_at_utc` as the fallback for deterministic hourly issue keys.

The promoted WSI daily weighted observed runtime modules are
`backend.scrapes.weather.wsi.daily_weighted_temperature_observations` and
`backend.scrapes.weather.wsi.daily_weighted_degree_day_observations`, with
combined orchestration at
`backend.orchestration.weather.wsi.daily_weighted_observations`. They write
daily observed rows from WSI Trader `GetHistoricalObservations` products
`HISTORICAL_WEIGHTED_TEMPERATURE` and `HISTORICAL_WEIGHTED_DEGREEDAYS` to
`weather.wsi_daily_weighted_temperature_observations` and
`weather.wsi_daily_weighted_degree_day_observations`. The source grain for both
tables is
`source_product_id x request_region x entity_id x observation_date x
metric_name`; safe reruns upsert by that key. Defaults are North America,
daily resolution, Fahrenheit, all historical weighted-temperature regions
accepted by WSI for the current account, and all nine historical weighted
degree-day regions accepted by the endpoint. Scheduled runs use a 14-day
rolling observed window and retain historical observed rows indefinitely. The combined
orchestration emits one `ops.data_availability_events` observed freshness event
for each table, marking `complete` only when the configured entities and
expected metrics are present for the latest observed date returned by WSI.

Run `python -m backend.scrapes.weather.wsi.station_metadata` manually to fetch
WSI Trader `GetCityIds` metadata and compare the returned station IDs against
the configured PJM station basket. This probe is not scheduled and writes no
weather table rows.

Forecast hot-table retention is enforced by the scrape runtime after successful
upserts for rolling forecast tables: ERCOT seven-day load forecasts, ISO-NE
regional demand/capacity/wind/solar forecasts, PJM seven-day load, hourly
solar/wind, WSI hourly and daily weighted forecasts, and Meteologica PJM hourly
forecasts.
Retention is keyed to the source issue, publication, or evaluation timestamp so
the table keeps 90 days of forecast vintages. Historical PJM Data Miner
`pjm.load_frcstd_hist` has been retired from current code because current
frontend and production workflows do not need the archive. Restore the previous
scrape and DDL from git history only if an approved model-training or archive
use case returns. Outage forecast tables remain indefinite unless operators
explicitly decide to truncate archive history.

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
telemetry row to `ops.api_fetch_log`, and emits a complete day readiness event.

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

Bloomberg Desktop API helpers are local Windows-only. They live under
`backend.scrapes.bloomberg_dapi` and `backend.orchestration.bloomberg_dapi`,
write the fixed Bloomberg security universe plus metadata to
`bbg_dapi.bbg_tickers`, and write daily historical values to
`bbg_dapi.bbg_historical`. `bbg_dapi.bbg_tickers` stores repo-owned business
metadata such as category, subcategory, region, market, commodity, unit, and
default data type. Scheduled Windows runs also enrich nullable Bloomberg
reference fields such as `NAME`, `SECURITY_DES`, `CRNCY`, `COUNTRY`, and
`MARKET_SECTOR_DES` through a BLPAPI `ReferenceDataRequest`. The historical
source grain is `security x date x data_type`; safe reruns upsert by that key.
Bloomberg DAPI requires Bloomberg Terminal to be running and logged in on the
same Windows host, with `bbcomm` reachable at `BBG_HOST:BBG_PORT`, defaulting
to `localhost:8194`. Do not install Bloomberg dependencies on the Linux VM,
and do not add Bloomberg systemd units under `infrastructure/systemd`.
Scheduled local runs first refresh `bbg_dapi.bbg_tickers`, then pull the
configured historical lookback through Bloomberg `//blp/refdata` and log both
steps to `ops.api_fetch_log` with `provider = 'bloomberg_dapi'`. Apply the
operator SQL under `dbt/azure_postgres/reference_sql/ddl/bbg_dapi/` with
`helios_admin` before enabling writes.

ICE Python settlement helpers are local Windows-only. They live under
`backend.scrapes.ice_python` and `backend.orchestration.ice_python`, write
non-option settlement marks to `ice_python.settlements` and contract-date
snapshots to `ice_python.settlement_contract_dates`, and require a licensed ICE
XL / ICE Python install on the Windows scheduler host. Do not install ICE
dependencies from `backend/requirements-local-windows.txt` on the Linux VM,
and do not add ICE systemd units under `infrastructure/systemd`.
The local Windows Task Scheduler coordinator runs the ICE scheduler in
`run_once` mode. Each Task Scheduler start runs the current local-time ICE
batch instead of skipping jobs that already failed earlier in the same hour.
It launches jobs in child Python processes with hard timeouts, prevents
overlapping manual/scheduled pulls with a local lock file, persists per-window
state with explicit success/failure/timeout statuses, and writes durable job
telemetry to `ops.api_fetch_log`. The scheduled short-term group includes PJM,
ERCOT, western power daily, eastern power daily, gas next-day, and gas BALMO
settlement symbols.

ICE trade blotter helpers are local manual-file workflows. They live under
`backend.scrapes.ice_trade_blotters` and
`backend.orchestration.ice_trade_blotters`, parse manually downloaded ICE Deal
Report `.xls`/CSV exports, write raw rows to
`ice_trade_blotter.ice_trade_blotter`, and write file lineage/load state to
`ice_trade_blotter.file_manifest`. They use the existing Azure Postgres writer
environment and do not create tables at runtime; apply the operator SQL under
`dbt/azure_postgres/reference_sql/ddl/ice_trade_blotter/` with `helios_admin`
before loading files. Local source files are cached under
`backend/scrapes/ice_trade_blotters/csv/` by default and that folder is
gitignored. The manual run path is
`python -m backend.orchestration.ice_trade_blotters.trades`; read-only raw
browsing and optional side-by-side inspection SQL lives under
`backend/scrapes/ice_trade_blotters/sql/inspection/`. No standardization layer,
Windows Task Scheduler job, or Linux systemd timer is promoted by default.

NAV position helpers are local SFTP workflows. They live under
`backend.scrapes.nav` and `backend.orchestration.nav`, write raw NAV position
valuation snapshots to `nav.positions`, and use the existing `NAV_SFTP_*`
environment variables. `nav.positions` stores the source workbook fields plus
file/fund metadata only. Product-code, product-group, contract,
instrument-type, and normalization-status fields are derived by read-only SQL
at query time, not persisted in the source table. The active runtime is the
local Windows Task Scheduler job installed from
`infrastructure/windows-task-scheduler/positions_and_trades/install_nav_positions_task.ps1`; do not
add NAV systemd units unless the workflow is explicitly promoted to the Linux
VM. Downloaded raw NAV workbooks are cached under
`backend/scrapes/nav/downloads/` by default and that folder is gitignored. The
downloader preserves already-cached workbooks instead of overwriting them,
because NAV source files can expire upstream. The scheduled path starts daily
at local hour `04` by default, targets the previous business NAV date, polls
SFTP every five minutes until `11:00` local time, waits for all selected funds
before upserting, writes `operation_name = 'nav_positions_scheduled'`
telemetry to `ops.api_fetch_log`, and exits nonzero if the target files miss
the polling window. Successful scheduled loads also enqueue an internal
ready-for-review email to `HELIOS_EMAIL_RECIPIENTS` with the cached NAV
workbooks attached; delivery depends on
`HELIOS_EMAIL_NOTIFICATIONS_ENABLED=true` and Microsoft Graph credentials.

NAV trade break helpers are local SFTP/email workflows. They live under
`backend.scrapes.nav.trade_breaks` and
`backend.orchestration.nav.trade_breaks_email`, use the existing `NAV_SFTP_*`
and `AZURE_OUTLOOK_*` variables, and do not upsert trade break rows to a
database table. The manual local run is
`python -m backend.orchestration.nav.trade_breaks_email`; it downloads the
latest matching NAV Trade Breaks workbook into
`backend/scrapes/nav/downloads/trade_breaks/`, enqueues a templated internal
email with that workbook attached for `HELIOS_EMAIL_RECIPIENTS`, and writes one
failure-visibility row to `ops.api_fetch_log` with target
`nav_email.nav_trade_breaks`. Delivery uses `ops.email_notification_outbox` and
depends on `HELIOS_EMAIL_NOTIFICATIONS_ENABLED=true` and Microsoft Graph
credentials. The scheduled path matches NAV positions: it starts daily at local
hour `04` by default, targets the previous business NAV date, polls SFTP every
five minutes until `11:00` local time, sends the workbook email when the target
Trade Breaks workbook exists, and exits nonzero if the target file misses the
polling window.

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
fails at 05:00 local time. Successful source-file loads enqueue an internal email to
`HELIOS_EMAIL_RECIPIENTS` with the downloaded raw Clear Street CSV attached;
delivery depends on `HELIOS_EMAIL_NOTIFICATIONS_ENABLED=true` and Microsoft
Graph credentials. Attachment paths are stored in the email outbox payload, so
cached CSVs must remain available until the email sender processes the row.
After the source file loads, the scheduled path runs the MUFG upload leg from
`backend.orchestration.positions_and_trades.clear_street_mufg_upload`. That
leg reads the promoted dbt-compiled SQL artifact at
`backend/orchestration/positions_and_trades/sql/clear_street_mufg_latest.sql`,
generated from the dbt
`positions_and_trades/2026_07_22_ref_tables.clear_street_eod_transactions.mufg.cs_ref_80_mufg_latest`
model. The scheduled Clear Street/MUFG handoff does not need the `dbt` CLI or
`DBT_POSTGRES_*` variables at runtime. It uses the Clear Street target trade
date for the exported
`helios_transactions_v3_YYYYMMDD_filtered.csv` filename when available, uploads
the CSV to MUFG SFTP, logs separate `ops.api_fetch_log` telemetry with
`provider = 'mufg_sftp'`. The scheduler's only freshness gate is the arrival
and load of the target Clear Street source file. MUFG upload success also
enqueues an internal email to `HELIOS_EMAIL_RECIPIENTS` with the generated
filtered MUFG CSV attached; the email body includes any MUFG-side warnings such
as empty extract, SQL trade-date mismatch, unexpected `trade_status` values
other than `New`, or product mapping issues. These conditions are recorded in
metadata for diagnosis instead of blocking the v3 upload.

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
MUFG Upload | Warning`. DA LMP release emails use one inline snapshot template
for PJM, NEPOOL, ERCOT, CAISO, MISO, SPP, and NYISO hub reports: hub summary
rows plus hourly component tables in the email body, with a Vercel single-day
report link as the live fallback. `Kapil.Saxena@HeliosCTA.com` is always
included in backend email recipient lists, even when the production environment file narrows
`HELIOS_EMAIL_RECIPIENTS` or `CLEAR_STREET_NAV_EMAIL_RECIPIENTS`. The PJM DA
HRL LMP, ISO-NE DA HRL LMP, ERCOT DAM SPP, CAISO DA LMP, MISO DA LMP, SPP DA
LMP, and NYISO DA LBMP scheduled workflows enqueue one release email per
configured `HELIOS_EMAIL_RECIPIENTS` recipient after complete-day readiness. The Clear
Street source and MUFG
handoff paths do enqueue internal emails with CSV attachments to
`HELIOS_EMAIL_RECIPIENTS` when email notifications are enabled.

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

For local Windows Bloomberg DAPI runs only:

```powershell
python -m pip install -r backend\requirements-local-bloomberg.txt -e backend
python -c "import blpapi; print('blpapi ok')"
python -c "from datetime import date; from backend.orchestration.bloomberg_dapi import historical; historical.main(start_date=date(2026, 7, 1), end_date=date(2026, 7, 1), dry_run=True)"
python -c "from backend.orchestration.bloomberg_dapi import tickers; tickers.main(enrich_reference_data=True)"
.\infrastructure\windows-task-scheduler\bloomberg_dapi\install_bloomberg_dapi_historical_task.ps1 `
  -RepoRoot C:\Users\AidanKeaveny\helioscta-prod\helioscta-platform `
  -PythonExe C:\Users\AidanKeaveny\miniconda3\envs\helioscta-platform-backend\python.exe `
  -LogDir C:\Users\AidanKeaveny\helioscta-prod\logs `
  -InstallDependencies `
  -RunImportSmoke
```

The Bloomberg SDK is resolved from Bloomberg's official package repository
through `backend\requirements-local-bloomberg.txt`. Official API references are
published at `https://bloomberg.github.io/blpapi-docs/`.

For local Windows ICE Python runs only:

```powershell
python -m pip install -r backend\requirements-local-windows.txt -e backend
python .\infrastructure\windows-task-scheduler\ice_python\install_ice_python.py
```

The installer resolves the proprietary ICE Python wheel from the licensed ICE XL
installation without committing the wheel to this repo. Set
`HELIOS_LOG_DIR=C:\ProgramData\HeliosCTA\logs`, and install the local Windows
Task Scheduler coordinator from
`infrastructure/windows-task-scheduler/ice_python/`.

For local SFTP runs only:

```powershell
python -m pip install -r backend\requirements-local-sftp.txt -e backend
python -m backend.orchestration.nav.positions
.\infrastructure\windows-task-scheduler\positions_and_trades\install_nav_positions_task.ps1 `
  -RepoRoot C:\Users\AidanKeaveny\helioscta-prod\helioscta-platform `
  -PythonExe C:\Users\AidanKeaveny\miniconda3\envs\helioscta-azure-backend\python.exe `
  -LogDir C:\Users\AidanKeaveny\helioscta-prod\logs `
  -InstallDependencies `
  -RunImportSmoke
python -m backend.orchestration.nav.trade_breaks_email
.\infrastructure\windows-task-scheduler\positions_and_trades\install_nav_trade_breaks_task.ps1 `
  -RepoRoot C:\Users\AidanKeaveny\helioscta-prod\helioscta-platform `
  -PythonExe C:\Users\AidanKeaveny\miniconda3\envs\helioscta-azure-backend\python.exe `
  -LogDir C:\Users\AidanKeaveny\helioscta-prod\logs `
  -InstallDependencies `
  -RunImportSmoke
python -m backend.orchestration.clear_street.transactions
.\infrastructure\windows-task-scheduler\positions_and_trades\install_clear_street_task.ps1 `
  -RepoRoot C:\Users\AidanKeaveny\helioscta-prod\helioscta-platform `
  -PythonExe C:\Users\AidanKeaveny\miniconda3\envs\helioscta-azure-backend\python.exe `
  -LogDir C:\Users\AidanKeaveny\helioscta-prod\logs `
  -StateDir C:\Users\AidanKeaveny\helioscta-prod\state `
  -InstallDependencies `
  -RunImportSmoke
```

## Manual Backfills

Promoted backfills are Python module entry points that call the same production
scrape/orchestration `main()` functions as the scheduled jobs where the source
contract needs readiness side effects, then rely on the existing primary-key
upserts for safe reruns.

Default module runs backfill one recent market day:

```bash
python -m backend.backfills.power.pjm.da_hrl_lmps
python -m backend.backfills.power.pjm.rt_hrl_lmps
python -m backend.backfills.power.pjm.rt_unverified_hrl_lmps
python -m backend.backfills.power.pjm.hrl_load_metered
python -m backend.backfills.power.pjm.hrl_load_prelim
python -m backend.backfills.power.pjm.gen_outages_by_type
python -m backend.backfills.power.caiso.da_lmps
python -m backend.backfills.power.caiso.rt_lmps
python -m backend.backfills.power.caiso.historical_lmps
python -m backend.backfills.weather.wsi.hourly_observed
python -m backend.backfills.weather.wsi.daily_weighted_observations
python -m backend.backfills.nav.positions_from_legacy_cache
python -m backend.backfills.ice_trade_blotters.from_legacy_cache
python -m backend.backfills.ice_python.futures
python -m backend.backfills.bloomberg_dapi.historical
```

For an ad hoc range, edit the `DEFAULT_START_DATE`, `DEFAULT_END_DATE`, or the
bottom `main(...)` call in the target module before running it on the VM. The
wrappers validate the requested window, support `dry_run=True`, and stamp API
fetch telemetry with backfill metadata where the underlying scrape supports it.
WSI observed backfills call the existing weather orchestration paths, so
successful hourly and daily weighted observed runs also emit the current WSI
freshness events. Use the read-only coverage SQL in
`docs/operations/manual-backfills.md` and `docs/operations/weather-backfills.md`
before handing historical coverage to frontend consumers.

The CAISO historical LMP backfill
`backend.backfills.power.caiso.historical_lmps` is the operator path for
loading DA and RT LMP history back to 2020. It uses CAISO's public bulk search
endpoint plus requester-pays S3 group ZIP downloads, defaults to `dry_run=True`,
chunks writes into 31-day windows, calls the raw CAISO scrape/upsert paths, and
stamps `ops.api_fetch_log.metadata` with
`backfill_family=caiso_lmp_historical_backfill`. It intentionally avoids
data-readiness events and release emails. Actual writes require standard AWS
credentials in `/etc/helioscta/backend.env`.

The NAV positions legacy-cache backfill copies workbooks from the old local
cache into `backend/scrapes/nav/downloads/` and then upserts parsed rows into
`nav.positions` with the same primary key as the scheduled SFTP workflow. It
does not move or delete legacy workbooks.

The ICE trade blotter legacy-cache backfill copies `.xls` files from the old
`helioscta-azure-backend` local cache into
`backend/scrapes/ice_trade_blotters/csv/formatted_files/`, registers them in
`ice_trade_blotter.file_manifest`, and upserts parsed raw rows into
`ice_trade_blotter.ice_trade_blotter`. It does not move or delete legacy files
and logs backfill attempts to `ops.api_fetch_log`.

ICE Python futures backfills write `ice_python.settlements` at
`trade_date, symbol` grain for monthly futures generated from the active PJM,
ERCOT, western power, eastern power, and gas registries. The default full
futures backfill requests `Settle`, `Open`, `High`, `Low`, `Close`,
`VWAP Close`, `Volume`, and `Open Interest` from 2020 through calendar 2028.
It emits `ops.api_fetch_log` telemetry through the shared ICE orchestration
runtime and reports source-missing symbols without failing the whole family
backfill.

Bloomberg DAPI historical backfills run only on the licensed Windows Bloomberg
Terminal host. Use `backend.backfills.bloomberg_dapi.historical` to refresh
`bbg_dapi.bbg_tickers` once and then replay daily `bbg_dapi.bbg_historical`
chunks with the same latest-row upsert key,
`security x date x data_type`. The default module run backfills only the prior
day. For a wider range, call `main()` with explicit dates:

```powershell
python -c "from backend.backfills.bloomberg_dapi import historical; print(historical.main(start_date='2020-01-01', end_date='2026-07-28', max_days=5000, chunk_days=31))"
```

Set `dry_run=True` to validate the requested date window without connecting to
Bloomberg or writing Postgres. The backfill does not preserve revisions; reruns
overwrite the same `security x date x data_type` rows.

## Scheduled LMP Price Repair

`backend.backfills.power.lmp_price_backfill_7_day` runs a nightly seven-day
repair over the promoted PJM, ISO-NE, ERCOT, CAISO, MISO, SPP, and NYISO LMP
price tables:

- `pjm.da_hrl_lmps`
- `pjm.rt_hrl_lmps`
- `pjm.rt_fivemin_hrl_lmps`
- `pjm.rt_unverified_hrl_lmps`
- `isone.da_hrl_lmps`
- `isone.rt_hrl_lmps_final`
- `isone.rt_hrl_lmps_prelim`
- `ercot.dam_stlmnt_pnt_prices`
- `ercot.settlement_point_prices`
- `caiso.da_lmps`
- `caiso.rt_lmps`
- `miso.da_lmps`
- `miso.rt_lmps_prelim`
- `miso.rt_lmps_final`
- `spp.da_lmps`
- `spp.rt_lmps_prelim`
- `nyiso.da_lmps`
- `nyiso.rt_lmps_prelim`

The VM timer is `helios-lmp-price-backfill-7-day.timer`, scheduled at
`22:15 UTC` after the current daily ISO-NE, ERCOT, CAISO, MISO, SPP, NYISO,
and PJM price timers. It uses feed-specific publication lags: DA feeds through the current
Eastern market date, unverified/preliminary RT and ERCOT price-adder feeds
through the prior market date, most verified/final RT feeds through two market
dates back, and MISO final RT through five calendar days back. CAISO repairs
use OASIS trading dates; SPP repairs use Central operating dates; NYISO
repairs use Eastern operating dates; DA repair runs through the current date,
while the scheduled CAISO DA, MISO DA, SPP DA, and NYISO DA pollers own
next-day publication.
It stamps API fetch
telemetry with `run_mode=backfill`, `backfill_workflow`, backfill window
fields, and `repair_family=lmp_price_backfill_7_day`, then relies on existing
primary-key upsert paths for safe reruns. Release email and data-readiness
side effects remain owned by the normal scheduled workflows.
