# PJM Fundies Frontend

Next.js 15, React 19, Tailwind, Recharts, and `pg` dashboard for prices-first
PJM short-term fundamentals.

## Runtime Contract

The frontend reads from `helios_prod` with `helios_readonly`. Do not expose
database secrets through `NEXT_PUBLIC_*` variables.

Set either:

```text
DATABASE_URL=postgres://helios_readonly:<password>@<host>:5432/helios_prod?sslmode=require
```

or:

```text
HELIOS_POSTGRES_READONLY_HOST=
HELIOS_POSTGRES_READONLY_USER=helios_readonly
HELIOS_POSTGRES_READONLY_PASSWORD=
HELIOS_POSTGRES_READONLY_PORT=5432
HELIOS_POSTGRES_READONLY_DBNAME=helios_prod
HELIOS_POSTGRES_READONLY_SSLMODE=require
```

The Genscape RT and Noms pages also read from Azure SQL. Set these server-only
variables in local development and Vercel:

```text
AZURE_SQL_DB_HOST=
AZURE_SQL_DB_PORT=1433
AZURE_SQL_DB_NAME=GenscapeDataFeed
AZURE_SQL_DB_USER=
AZURE_SQL_DB_PASSWORD=
AZURE_SQL_CONNECTION_TIMEOUT_MS=12000
AZURE_SQL_REQUEST_TIMEOUT_MS=28000
```

The frontend validates `AZURE_SQL_DB_NAME=GenscapeDataFeed` before connecting.
Do not expose Azure SQL credentials through `NEXT_PUBLIC_*` variables.

The local DEV-only GTN Balance page reads directly from Criterion Snowflake.
Set these server-only variables for local development:

```text
CRITERION_SNOWFLAKE_ACCOUNT=
CRITERION_SNOWFLAKE_USER=
CRITERION_SNOWFLAKE_PASSWORD=
CRITERION_SNOWFLAKE_WAREHOUSE=
CRITERION_SNOWFLAKE_DATABASE=PRODUCTION
CRITERION_SNOWFLAKE_ROLE=
CRITERION_SNOWFLAKE_SCHEMA=
CRITERION_SNOWFLAKE_QUERY_TIMEOUT_MS=30000
```

Do not expose Criterion Snowflake credentials through `NEXT_PUBLIC_*`
variables.

## Local Development

```bash
cd frontend
npm install
npm run dev
npm run lint
npm run build
npm run check:api
```

The production route is `/`. The active compatibility API routes are:

```text
GET /api/ops/readiness
GET /api/pjm-term-bible?product=rt&rtSource=verified&component=total&period=5x16&hub=WESTERN%20HUB&startYear=2022&endYear=2026&month=7
GET /api/pjm-historical-settlements?view=single&location=WESTERN%20HUB&market=RT_VERIFIED&period=all&month=6&startYear=2020&endYear=2026&component=total
GET /api/pjm-forecast-explorer
GET /api/pjm-forecasts?area=RTO_COMBINED
GET /api/pjm-forecast-differences?area=RTO_COMBINED&date=YYYY-MM-DD&lookbackHours=72
GET /api/pjm-forecast-date-compare?source=pjm&type=load&area=RTO_COMBINED&baseDate=YYYY-MM-DD&compareDate=YYYY-MM-DD
GET /api/pjm-forecast-date-compare?source=meteologica&type=load&area=RTO&baseDate=YYYY-MM-DD&compareDate=YYYY-MM-DD
GET /api/pjm-meteologica-forecast-explorer
GET /api/pjm-meteologica-forecast-differences?area=RTO&date=YYYY-MM-DD&lookbackHours=72
GET /api/cache/warm-forecasts
GET /api/pjm-load-growth-yoy?loadArea=DOM&stationId=KRIC&region=PJM&lookbackDays=56&dateMode=lookback&loadShape=flat&dayType=all
GET /api/map/pipelines
GET /api/map/search?q=TRANSCO&limit=5
GET /api/map/locations?pipeline=TRANSCO&limit=25
GET /api/genscape-noms/filters?pipelines=TRANSCO
GET /api/genscape-noms?start=YYYY-MM-DD&end=YYYY-MM-DD&pipeline=TRANSCO&limit=50&includeCount=false
GET /api/genscape-noms/map?start=YYYY-MM-DD&end=YYYY-MM-DD&pipeline=TRANSCO&limit=200
GET /api/criterion/gtn-pipeline-balance?date=YYYY-MM-DD&refresh=1
GET /api/nav-positions?productGroup=Power&productRegion=PJM
GET /api/nav-positions/drilldown?productGroup=Power&productRegion=PJM&limit=100&drilldown=<json>
GET /api/clear-street-trades?limit=500
GET /api/clear-street-trades/drilldown?limit=100&drilldown=<json>
GET /api/ice-trade-blotter/raw?date=YYYY-MM-DD
GET /api/ice-trade-blotter/raw/drilldown?date=YYYY-MM-DD&limit=100&drilldown=<json>
```

Local development also exposes a clearly separated `DEV` sidebar section:

```text
GET /api/spark-spread-evolution?sparkProduct=PJM_WH_RT_TETCO_M3_7X&strip=H
GET /api/ice-trade-blotter/daily-settlements?scope=pjm
GET /api/ice-trade-blotter/daily-settlements?scope=ercot
GET /api/ice-trade-blotter/product-dictionary?scope=pjm
GET /api/ice-trade-blotter/product-dictionary?scope=ercot
GET /api/gas-daily-prices?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
GET /api/pjm-generation?endDate=YYYY-MM-DD&lookbackDays=7
GET /api/weather/hourly-temps?region=PJM&observedLookbackDays=3&forecastRun=primary
GET /api/weather/hourly-forecast?region=PJM&station=PJM&forecastRun=primary
GET /api/weather/wsi-forecast-map?region=PJM&date=YYYY-MM-DD&forecastRun=primary
GET /api/pjm-net-load-forecast-explorer?source=pjm
GET /api/pjm-net-load-forecast-explorer?source=meteologica
GET /api/pjm-net-load-forecast-differences?source=pjm&area=RTO&date=YYYY-MM-DD&lookbackHours=72
GET /api/pjm-net-load-forecast-differences?source=meteologica&area=WEST&date=YYYY-MM-DD&lookbackHours=72
GET /api/pjm-net-load-forecast-date-compare?source=pjm&area=RTO&baseDate=YYYY-MM-DD&compareDate=YYYY-MM-DD
GET /api/pjm-net-load-forecast-date-compare?source=meteologica&area=WEST&baseDate=YYYY-MM-DD&compareDate=YYYY-MM-DD
```

The `DEV` section and routes are enabled only for local Next.js runs. Vercel
builds hide the sidebar section and return `404` from these routes.

## Production Endpoint Standard

Every dashboard API route should use the shared server observability wrapper in
`lib/server/apiObservability.ts` and the measured Postgres helper in
`lib/server/db.ts`.

## PJM Term Bible Source Contract

The Term Bible view reads historical hourly PJM LMPs with `helios_readonly`
from `pjm.da_hrl_lmps`, `pjm.rt_hrl_lmps`, and
`pjm.rt_unverified_hrl_lmps`.

Source system: PJM Data Miner 2 hourly LMP feeds.

Promoted table grain:
DA and verified RT are keyed by
`datetime_beginning_utc x pnode_id x pnode_name x row_is_current x version_nbr`.
Unverified RT is keyed by `datetime_beginning_utc x pnode_name x type`.

The route `GET /api/pjm-term-bible` accepts bounded params: `product=rt|da`,
`rtSource=verified|unverified`, `hub`, `component=total|energy|congestion|loss`,
`period=5x16|7x16|7x8|wrap|7x24`, `month`, `startYear`, and `endYear`. The response
returns monthly values, monthly mean/min/max, yearly stats, and daily values for
the selected detail month. `5x16` is NERC business-day HE8-23, `7x16` is all
days HE8-23, `7x8` is all days HE1-7/HE24, `wrap` is 7x8 plus NERC off-peak
day HE8-23, and `7x24` is all hours. Legacy aliases `onpeak`, `offpeak`, and
`flat` map to `5x16`, `wrap`, and `7x24`. NERC off-peak days are generated by
the shared frontend trading calendar helpers. Hub spreads in the UI are derived
client-side from two route payloads as `To Hub - From Hub`.

## PJM Historical Settlements Source Contract

The Historical Settlements view reads historical hourly PJM LMPs with
`helios_readonly` from `pjm.da_hrl_lmps`, `pjm.rt_hrl_lmps`, and
`pjm.rt_unverified_hrl_lmps`.

Source system: PJM Data Miner 2 hourly LMP feeds.

Promoted table grain:
DA and verified RT are keyed by
`datetime_beginning_utc x pnode_id x pnode_name x row_is_current x version_nbr`.
Unverified RT is keyed by `datetime_beginning_utc x pnode_name x type`.

The route `GET /api/pjm-historical-settlements` accepts bounded params:
`view=single|spread`, `location`, `fromLocation`, `toLocation`,
`market=RT_VERIFIED|RT_UNVERIFIED|DA|DART`, `period=all|5x16|7x16|7x8|wrap|7x24`,
`month`, `startYear`, `endYear`, `component`, and `scarcityLimit`. It returns
the selected strip average, HE1-HE24 hourly averages, and ranked scarcity hours
with total, energy, congestion, and loss components. `RT` is accepted as a
backward-compatible alias for `RT_VERIFIED`. Unverified RT energy is derived as
total minus congestion minus loss. `DART` is derived as DA minus verified RT on
matching `datetime_beginning_utc x pnode_name`. Spread view is computed as
`toLocation - fromLocation` on matched hourly timestamps. The strip definitions
match Term Bible: `5x16` business-day HE8-23, `7x16` all days HE8-23, `7x8` all
days HE1-7/HE24, `wrap` 7x8 plus weekend HE8-23, and `7x24` all hours.
Historical-only `all` returns all settlement strip rows and uses all hours for
the hourly breakdown and scarcity table. NERC off-peak days are generated by the
shared frontend trading calendar helpers and applied to `5x16` and `wrap`.

The Historical Settlements page also hosts Term Bible as a second tab. The
embedded Term Bible view reuses `GET /api/pjm-term-bible`, renders tables only,
and suppresses the daily plot. Legacy links with `?section=pjm-term-bible` open
the Historical Settlements page on the Term Bible tab.

## NAV Positions Source Contract

The Positions view reads NAV position valuation snapshots with
`helios_readonly` from `nav.positions`. The page is production-visible at
`/?section=nav-positions` for users who can access the protected Vercel
deployment. The production endpoints are `GET /api/nav-positions` for the
summary ladder and `GET /api/nav-positions/drilldown` for bounded cell-level
rows. The local-only compatibility alias `GET /api/dev/nav-positions` still
returns the same handler only in local Next.js runs.

Source system: NAV SFTP Position Valuation Detail Report XLSX files.

Promoted table grain:
`fund_code x nav_date x sftp_upload_timestamp x source_file_name x source_file_row_number`.

The route reads promoted dbt frontend contracts from
`frontend/sql/nav-positions/frontend/latest.sql` when no `date` is requested
and `frontend/sql/nav-positions/frontend/all_history.sql` when `date` is
provided. Those files are generated by dbt from:

```text
dbt/azure_postgres/models/positions_and_trades/2026_07_22_ref_tables/nav_positions/frontend/nav_ref_frontend_positions_latest.sql
dbt/azure_postgres/models/positions_and_trades/2026_07_22_ref_tables/nav_positions/frontend/nav_ref_frontend_positions_all_history.sql
```

Promotion also writes `frontend/sql/positions-and-trades/manifest.json`, which
maps the stable Positions & Trades Reference Model labels to the promoted SQL
files and their dbt source models. Frontend routes read this manifest for
operator-facing metadata instead of hard-coding the dated dbt model family.

Promote compiled SQL into the frontend generated artifact paths with:

```powershell
cd dbt\azure_postgres
dbt compile --profiles-dir . --select path:models/positions_and_trades/2026_07_22_ref_tables
python scripts\promote_positions_trades_sql.py
```

Lookup-only product/account/month changes are applied by syncing the
`positions_and_trades_ref` reference tables and do not require frontend SQL
promotion. Query logic or output-contract changes require recompiling the
active ref-table dbt model and promoting the frontend SQL snapshots again.

The route accepts bounded params:
`date=YYYY-MM-DD`, `fund`, `accountGroup`, `product`,
repeated or comma-separated `productGroup`, `productRegion`, and
`productCode`, plus `instrumentType=future|option`, `putCall=C|P`,
`refresh=1`, and bounded drilldown `limit=25..1000`. Without `date`, it selects
the latest NAV date and latest upload per fund. The UI default is explicit:
`productGroup=Power&productRegion=PJM`, so the API reduces grouped result and
payload work instead of only filtering in React.

The response returns a product summary aggregated by normalized product
identity: `product_code`, `product_group`, `product_region`,
`underlying_product_code`, `contract_yyyymm`, `contract_day`, `put_call`, and
`normalized_strike_price`. Those fields are computed by dbt read-only SQL from
raw `nav.positions` columns; they are not stored in `nav.positions`. Fund and
account are coverage fields on the grouped row, not grouping keys. It does not
mutate data or create a frontend cache table. The page pivots this response
client-side into a Short Term Power-style ladder with products as rows and net
quantity by contract bucket as columns: short-term day/week buckets first,
followed by monthly futures columns labelled `YYYY-MM`.

Drilldown rows are bounded cell investigations, not exports. The modal calls
`GET /api/nav-positions/drilldown` with the same table filters plus a JSON
`drilldown` filter for product identity and contract bucket. The returned rows
include NAV/trade dates, product identity, account, quantity, multiplier,
trade/settle marks, `product_norm`, and dbt rule fields.

Access control: NAV Positions uses the same deployment-wide Vercel protection
as the rest of the app. There is no separate app OAuth session, positions-only
email allowlist, or service-token bypass.

Caching: protected NAV Positions responses use `Cache-Control: private,
no-store` and `Vercel-CDN-Cache-Control: no-store`. Do not re-enable public CDN
caching for these endpoints unless the cache key is proven user-safe.

Index/operator note: as of July 21, 2026, live `nav.positions` indexes were
verified as `positions_pkey`, `idx_nav_positions_fund_nav_date`,
`idx_nav_positions_latest_file`, `idx_nav_positions_product_lookup`,
`idx_nav_positions_account_lookup`, `idx_nav_positions_account_trade_date`, and
`idx_nav_positions_updated_at`. Apply future indexes only as an operator DDL
action with a write-capable role and autocommit; the app and dbt project must
not create them.

## ICE Trade Blotter Source Contract

The ICE Trade Blotter view reads manually loaded raw ICE Deal Report rows with
`helios_readonly` from `ice_trade_blotter.ice_trade_blotter` and file lineage
from `ice_trade_blotter.file_manifest`. The page is production-visible in the
Back Office sidebar at `/?view=ice-trade-blotter`; the legacy direct link
`/?section=ice-trade-blotter` remains accepted. The production endpoints are
`GET /api/ice-trade-blotter/raw` for the NAV-style aggregate grid and
`GET /api/ice-trade-blotter/raw/drilldown` for bounded raw row inspection.

Source system: manually downloaded ICE Deal Report `.xls`/CSV exports loaded by
`backend.orchestration.ice_trade_blotters.trades`.

Promoted table grain:
one raw ICE deal-leg row from one managed source file. The operator DDL enforces
the raw business key with a `UNIQUE NULLS NOT DISTINCT` index over deal, trade
date, user, leg, side, hub, contract, begin/end date, quantity, price, option,
and strikes.

The route accepts bounded params:
`date=YYYY-MM-DD`, repeated or comma-separated `side`, `trader`,
`clearingAcct`, `custAcct`, `clearingFirm`, `product`, `hub`, `contract`,
`option`, `dealSection`, `source`, `userId`, `search`, `refresh=1`, and
drilldown-only `limit=25..1000`. Without `date`, it selects the latest
`trade_date`. The summary route returns the latest 90 trade dates, filter
options from the selected trade-date/search snapshot, source freshness, raw
counts, and aggregate rows grouped by raw ICE display identity: `product`,
`hub`, `contract`, `begin_date`,
`end_date`, `option`, `strike`, `strike_2`, `cc`, `strip`, and `deal_section`.
Signed display quantity treats clear sell-side `b_s` values as negative, but
the drilldown returns the original raw row fields.

The Back Office ICE Trade Blotter page also embeds the same Titan-filtered
Clear Street Trades review card used by Trade Pipeline beneath the raw ICE
grid. That embedded comparison continues to read `GET /api/clear-street-trades`
and `GET /api/clear-street-trades/drilldown`; it does not join or mutate ICE
and Clear Street data in the browser.

This page is visual inspection only. It does not add dbt models, product
standardization, product matching, frontend cache tables, backend writes,
scheduled jobs, or new credentials.

Access and caching match NAV Positions: the server-rendered home page hides the
Positions section for unauthorized users, both ICE raw APIs fail closed with
`404` through the same app-auth gate, and responses use
`Cache-Control: private, no-store` plus `Vercel-CDN-Cache-Control: no-store`.

## Clear Street Trades Source Contract

The Clear Street Trades view reads a promoted dbt mart from
`frontend/sql/clear-street-trades/marts/eod_all_history.sql`. That file is
generated by dbt from
`dbt/azure_postgres/models/positions_and_trades/2026_07_22_ref_tables/clear_street_eod_transactions/marts/cs_ref_65_eod_all_history.sql`
and promoted into the frontend with:

```powershell
cd dbt\azure_postgres
dbt compile --profiles-dir . --select path:models/positions_and_trades/2026_07_22_ref_tables
python scripts\promote_positions_trades_sql.py
```

The route reads `frontend/sql/positions-and-trades/manifest.json` for the
stable Clear Street Trades Review Contract label and dbt path metadata.
Lookup-only product/account/month changes are applied by syncing
`positions_and_trades_ref` and do not require frontend SQL promotion.

The underlying source table is `clear_street.eod_transactions`; dbt owns the
cleanup, account lookup, product matching, `rule_status`, and vendor export
code logic. The frontend route does not run product matching rules in
TypeScript.

The page appears in the `Positions` sidebar section at
`/?section=clear-street-trades`. Production uses
`GET /api/clear-street-trades`; the legacy `/api/dev/clear-street-trades`
alias remains local-only and returns `404` on Vercel.

The summary route accepts bounded params `limit=25..2000`, `date=YYYY-MM-DD`
mapped to `sftp_date`, repeated or comma-separated `account`, `productCode`,
`productFamily`, `marketName`, `status`, optional `search`, and `refresh=1`.
Without `date`, it selects the latest SFTP date and latest upload for that
date. It returns available SFTP dates, filter options, source freshness, review
counts, a product/contract aggregate ladder, bounded raw rows, and signature
diagnostics. `GET /api/clear-street-trades/drilldown` accepts the same
params plus drilldown-only `limit=25..2000` and `drilldown=<json>` for bounded
raw row inspection.

The Clear Street page uses the same vendor-code warning criteria as the backend
MUFG email warning: blank/null product grouping remains a taxonomy issue, while
vendor-code completeness is keyed by Clear Street exchange route. ICE exchange
rows need an ICE code, and NYMEX exchange rows need either a CME or Bloomberg
code. The API highlights the selected SFTP snapshot, then lets Postgres join
those selected-file signatures back to all matching history. It does not pull
all history into TypeScript, does not mutate data, and does not create a cache
table.

## Back Office Monitor Source Contract

The Monitor tab reads email delivery telemetry with `helios_readonly` from
`ops.email_notification_outbox` and `ops.api_fetch_log`. It does not create a
monitor table, mutate delivery state, or resend mail. `GET
/api/backoffice-monitor` returns the latest workflow routing rows plus a
bounded previous-delivery history. Internal emails are grouped by
`source_event_key`/`notification_key`; the Clear Street to NAV direct email is
grouped from Microsoft Graph telemetry. Business dates are derived from emitted
payload metadata such as `nav_date`, `trade_date`, and `trade_date_from_sftp`,
with telemetry creation date as the fallback. The UI opens each history row in
a modal with recipient-level delivery details.

## Power Sparks Source Contract

The Power Sparks view reads non-option ICE settlement marks with
`helios_readonly` from `ice_python.settlements`. It appears in the `Pricing`
sidebar section at `/?section=spark-spreads&pricingMode=spark&sparkStrip=H`;
the page and `GET /api/spark-spread-evolution` are production-visible on Vercel.

Source system: ICE Python / ICE XL local Windows runtime.

Promoted table grain: `trade_date x symbol`, with primary key
`(trade_date, symbol)` and freshness field `updated_at`.

The first slice supports the PJM Western Hub RT 7x Tetco M3 spark product:
`PMI - (HNG + TMT) * 7.0`. The route accepts `strip` or legacy-compatible
`sparkStrip` month/composite codes and optional `sparkProduct`. It builds
bounded ICE symbols from current year minus four through current year plus
three, returns complete daily spark points only when power, gas, and basis legs
are present, and exposes latest trade date, latest `updated_at`, row count, and
source table metadata in the payload. It does not create a database model, frontend
cache table, backend job, or new credential requirement.

## Local DEV Gas Prices Source Contract

The Gas Prices DEV view reads ICE physical next-day gas settlements with
`helios_readonly` from `ice_python.settlements`. It appears in the local `DEV`
sidebar section at `/?section=gas-prices`; Vercel builds hide the page and
return `404` from `GET /api/gas-daily-prices`.

Source system: ICE Python / ICE XL local Windows runtime.

Promoted table grain: `trade_date x symbol`, with primary key
`(trade_date, symbol)` and freshness field `updated_at`.

The route `GET /api/gas-daily-prices` accepts bounded gas-day params
`startDate=YYYY-MM-DD` and `endDate=YYYY-MM-DD`, with a maximum range of 120 gas
days. The response returns a daily WVAP Close matrix over the promoted next-day
physical gas hub registry. Gas-day attribution is generated from the shared ICE
physical gas trading calendar, so weekend and holiday strips use the same
mapping as the standalone SQL verifier. It does not create a database model,
frontend cache table, backend job, or new credential requirement.

## Power ICE Settles Source Contract

The Power ICE Settles view reads PJM and ERCOT settlement marks with
`helios_readonly` from promoted ISO LMP tables and `ice_python.settlements`,
using the frontend trade-blotter product dictionary for the displayed contract
catalog. It appears in the `Pricing` sidebar section at
`/?section=ice-settlements`; the page and supporting ICE settle routes are
production-visible on Vercel.

Source systems: PJM hourly LMP tables, ERCOT DAM/RT settlement-point price
tables, and ICE Python / ICE XL local Windows settlement tables.

Primary settle grain:
`market_date x cc x hub x contract x settlement_source_key`.

The PJM scope remains the default and covers short-term `PDP`, `PWA`, `PDA`,
`PJL`, `PDO`, and `ODP` rows plus monthly futures `PMI` and `OPJ`. The ERCOT
scope covers backend ICE registry rows for ERCOT North short-term symbols
`ERA`, `END`, `NED`, and `NDA`, plus monthly futures `ERN` and `ECI`.
`GET /api/ice-trade-blotter/daily-settlements?scope=pjm` and
`GET /api/ice-trade-blotter/daily-settlements?scope=ercot` return daily settle
rows and metadata. The product dictionary route exposes the rules used for
mapping trade-blotter product codes to settlement sources. The copied
trade-level matching routes still expect the legacy
`ice_trade_blotter.ice_trade_blotter` relation and are not exposed in the UI
until that source table is promoted into this database. This work does not
create a database model, frontend cache table, backend job, or new credential
requirement.

## Local DEV PJM Generation Source Contract

The Generation DEV view reads PJM generation and capacity feeds with
`helios_readonly` from `pjm.gen_by_fuel`, `pjm.day_gen_capacity`, and
`pjm.rt_and_self_ecomax`.

Source system: PJM Data Miner 2 generation feeds.

Promoted table grain:
`pjm.gen_by_fuel` is keyed by `datetime_beginning_utc x fuel_type`.
`pjm.day_gen_capacity` is keyed by `bid_datetime_beginning_utc`.
`pjm.rt_and_self_ecomax` is keyed by `datetime_beginning_utc`.

The route `GET /api/pjm-generation` accepts optional `endDate=YYYY-MM-DD` and
`lookbackDays=1..31`; legacy `date=YYYY-MM-DD` is still accepted as a
single-day request. Without a date, it selects the latest `pjm.gen_by_fuel`
operating day, even when the current day is still partial. Historical selectable
dates still require at least 23 hourly timestamps, allowing DST-short days. The
response returns selected lookback dates, per-date fuel-hour coverage, hourly
fuel mix, hourly fuel ramps, daily fuel summaries, capacity economic max,
emergency max, committed capacity, scheduled-generation economic max fields,
fuel summary rows, and source-window freshness. Capacity and
scheduled-generation feeds are joined as nonblocking overlays, so fuel-mix date
depth and intraday availability are not limited by `pjm.rt_and_self_ecomax`.

## PJM Daily Load Growth Source Contract

The Load Growth section is a daily weather-normalized YoY explorer. It reads
`pjm.hrl_load_prelim`, `pjm.hrl_load_metered`, and
`weather.wsi_hourly_observed_temperatures` with `helios_readonly` and joins load
to WSI observed weather on local EPT hour before aggregating to daily rows:
`datetime_beginning_ept = observation_time_local`.

The production endpoint returns daily comparison rows plus a compact latest
forecast daily series. In `month-years` mode, selected calendar dates are
retained when either selected comparison year is available, so missing load
coverage is visible as null values instead of silently dropping the date. The
route accepts comma-separated `months` and exactly two comparison years in
`years`; the later year is plotted as the current year and the earlier year is
the comparison year. Defaults are the current calendar month, current year, and
previous year. It intentionally does not return hourly actual records because
the hourly payload/query path is too slow for the production website.

The date-range UI uses `MM-DD` start and end selectors plus the same two-year
YoY selector. The client expands those month/day values into concrete dates in
the later selected year before calling the API. The API preserves rows when only
the earlier comparison year has actual load/weather, so users can inspect
future current-year calendar days against last-year actuals.

Current promoted coverage is shallow, so the UI must not treat the result as
confirmed structural load growth. The production endpoint uses unverified
metered rows from `pjm.hrl_load_metered` (`is_verified = false`), then falls
back to `pjm.hrl_load_prelim` when matching metered rows are missing.
Preliminary load currently has one row per
`(datetime_beginning_utc, load_area)`. Metered load is keyed by
`datetime_beginning_utc, nerc_region, mkt_region, zone, load_area, is_verified`;
RTO is the preferred metered area, and non-RTO metered views should be inspected
with the component count caveat.

Forecast points in the Load Growth chart use latest-vintage
`pjm.load_frcstd_7_day` load forecasts joined to latest-vintage
`weather.wsi_hourly_forecasts` for the selected station on EPT/local hour. The
daily forecast series applies the same load shape and weekday/weekend filters as
the actual daily series and is plotted as a separate non-fit overlay.

## WSI Weather Source Contract

## PJM Meteologica Load Forecast Source Contract

The Meteologica mode in Forecasts reads
`meteologica.pjm_forecast_hourly` using `helios_readonly`.

Source system: Meteologica xTraders Markets API
`contents/{content_id}/data` through the ISO account.

Canonical grain:
`content_id x update_id x forecast_period_start`.

The Forecasts UI currently exposes load forecasts only for `RTO`, `MIDATL`,
`SOUTH`, and `WEST`. The backend keeps 90 days of forecast issue history in the
hot table.

The route `GET /api/pjm-meteologica-forecast-explorer` returns the same
area/date explorer shape as PJM Data Miner load forecasts. The route
`GET /api/pjm-meteologica-forecast-differences` accepts `area`, `date`, and
`lookbackHours` and returns the same snapshot/delta vintage shape used by the
PJM Data Miner forecast explorer popup.

## PJM Forecasts Source Contract

The Forecasts page exposes three shared filters: `Data Source` (`PJM` or
`Meteologica`), `Type` (`Load` or `Net Load`), and `View` (`Outright` or
`Compare Day`). Load forecasts use the existing PJM Data Miner and
Meteologica explorer routes. `Compare Day` for load uses
`GET /api/pjm-forecast-date-compare` to return latest-vintage hourly curves for
two selected forecast dates plus `B - A` deltas.

For `type=netLoad`, `GET /api/pjm-forecast-date-compare` forwards to the
net-load comparison route and preserves the same request contract.

The Forecasts client prefetches the PJM and Meteologica load and net-load
explorer payloads after initial render. Heavy Forecasts explorer and
compare-day routes use `s-maxage=600`, `stale-while-revalidate=600`, and
`stale-if-error=3600` so Vercel can keep serving the last good forecast
snapshot during a transient database timeout.

`GET /api/cache/warm-forecasts` is a protected no-store cache warmer for
Forecasts. It warms PJM and Meteologica load/net-load explorer routes, reads
their available forecast dates, then warms the default compare-day URLs used by
the page (`RTO_COMBINED` for PJM load and `RTO` for Meteologica/load net-load
views). Local development may call it without a secret. Vercel/production must
set `CRON_SECRET` for the committed Vercel Cron schedule; the route also accepts
`HELIOS_CACHE_WARM_SECRET` for external schedulers. Manual calls can authenticate
with either `Authorization: Bearer <secret>` or `x-cache-warm-secret: <secret>`.
The Vercel Cron schedule runs every 15 minutes in UTC.

## PJM Net Load Forecast Source Contract

The Forecasts page derives net load from either PJM Data Miner or Meteologica
forecast rows using `helios_readonly`.

Source systems:
PJM Data Miner `pjm.load_frcstd_7_day`, `pjm.hourly_solar_power_forecast`,
and `pjm.hourly_wind_power_forecast`; Meteologica xTraders promoted hourly
forecast rows in `meteologica.pjm_forecast_hourly`.

Derived formula:
`net_load_mw = load - solar - wind`.

The net-load outright view displays fixed component rows for `load`, `wind`,
`solar`, and `net load`, with a statistic selector for `Peak`, `OnPeak`,
`OffPeak`, and `Flat`. PJM mode remains RTO-only and uses
`RTO_COMBINED` load, `solar_forecast_mwh`, and `wind_forecast_mwh`.
Meteologica mode returns regional summaries for available `forecast_area`
values with complete `load`, `solar`, and `wind` coverage, currently `RTO`,
`MIDATL`, `SOUTH`, and `WEST`. Each load issue is paired to the latest prior
non-null solar and wind forecast for the same forecast area and forecast hour.
Hours are emitted only when load, wind, and solar all have non-null MW values,
so net load is missing whenever either renewable component is missing. It does
not create a database model, table, or materialized cache.

The route `GET /api/pjm-net-load-forecast-date-compare` accepts `source`,
`area`, `baseDate`, and `compareDate`. It returns the latest complete hourly
load, solar, wind, and net-load curves for both selected forecast dates plus
`B - A` deltas, using the same component-completeness rule as the explorer.

The default Weather view reads WSI observed and forecast weather from
`weather.wsi_hourly_observed_temperatures` and
`weather.wsi_hourly_forecasts` using `helios_readonly`.

Observed grain:
`station_id x observation_time_local x region`.

Forecast grain:
`station_id x region x forecast_issued_at_utc x forecast_time_utc`.

Required observed fields:
`station_id`, `station_name`, `region`, `observation_date`,
`hour_beginning`, `observation_time_local`, `temp_f`, `dew_point_f`,
`feels_like_f`, `wind_chill_f`, `heat_index_f`, `wind_speed_mph`,
`wind_dir_degrees`, `relative_humidity_pct`, `cloud_cover_pct`, `precip_in`,
and `updated_at`.

Required forecast fields:
`station_id`, `station_name`, `region`, `forecast_issued_at_utc`,
`forecast_time_utc`, `temp_f`, `temp_diff_f`, `temp_normal_f`, `dew_point_f`,
`cloud_cover_pct`, `feels_like_f`, `feels_like_diff_f`, `precip_in`,
`wind_dir_degrees`, `wind_speed_mph`, `ghi_irradiance`,
`probability_of_precip_pct`, `relative_humidity_pct`, and `updated_at`.

The WSI Forecast Map tab uses
`GET /api/weather/wsi-forecast-map` for a single PJM/EPT operating day. The
route selects the primary or intraday WSI issue for the requested day, converts
forecast valid UTC timestamps to `America/New_York` hours, converts WSI
observed station-local timestamps back to PJM/EPT using station time-zone
metadata, and returns forecast, observed, and observed-minus-forecast hourly
values by station. Station coordinates are keyed by `station_id` and come from
the promoted WSI station metadata in
`frontend/lib/weather/wsiStationMetadata.ts`. The synthetic `PJM` station is
kept for aggregate charting but is not rendered as a map marker.

Production routes should expose:

- Bounded inputs for any date range, execution count, or large-result selector.
- A clear `Cache-Control` policy with stale-while-revalidate when safe.
- Structured logs with route, status, duration, DB duration, DB query count,
  row count, payload bytes, cache policy, data-as-of, and error type.
- Internal diagnostics headers: `Server-Timing`, `X-Helios-Route`,
  `X-Helios-Cache-Policy`, and `X-Helios-Data-As-Of`.
- A freshness source tied to table timestamps or `ops.data_availability_events`.

Use Vercel Observability to rank weak endpoints by function duration, errors,
and status codes. Use Postgres query statistics or Azure query performance
tools to connect slow routes back to slow SQL.

## Genscape RT/Noms Source Contract

The RT map (`/?section=map`) and Noms report (`/?section=noms`) are local-dev
only while the Genscape workflow is staged. They are hidden from Vercel
navigation, direct section routing is disabled on Vercel, and the matching
`/api/map/*`, `/api/genscape-noms/*`, and `/api/watchlists/*` routes return 404
outside local development. Source reads are backed by Azure SQL
`GenscapeDataFeed.natgas`.

Source system: WoodMac/Genscape natgas import on the local Windows Task
Scheduler path documented under `infrastructure/windows-task-scheduler/`.

Primary source tables:
`natgas.pipelines`, `natgas.location_extended`, `natgas.location_role`,
`natgas.nominations`, `natgas.no_notice`, and `natgas.nomination_cycles`.
Nominations are keyed by `gas_day x location_role_id x cycle_code`; map
metadata is keyed by pipeline/location/location-role identifiers. Freshness for
Noms is derived from returned `nominations.update_timestamp` rows when present,
falling back to the requested date window for empty filtered responses.

Genscape source data remains read-only in Azure SQL. Saved Noms watchlists are
app-owned data in Azure Postgres under `helioscta_app`:

- `helioscta_app.genscape_noms_watchlists`
- `helioscta_app.genscape_noms_watchlist_roles`

Apply
`dbt/azure_postgres/reference_sql/ddl/frontend/genscape_noms_watchlists/table_genscape_noms_watchlists.sql`
as `helios_admin` before enabling watchlist writes, then run the matching
`verify_genscape_noms_watchlists.sql`. The frontend exposes `/api/watchlists`
and `/api/watchlists/[watchlistId]/roles` mutation routes using a separate
writer connection. Configure either `HELIOS_POSTGRES_WRITER_URL` or
`HELIOS_POSTGRES_WRITER_*`; `AZURE_POSTGRES_WRITER_*` remains supported as a
fallback. The writer user must be `helios_admin` and the database must be
`helios_prod`. Existing read-only Postgres routes continue to use
`HELIOS_POSTGRES_READONLY_*`.

RT selections can still be handed to Noms through session storage or direct
`locationRoleId` URL params for ad hoc work.

## Criterion GTN Balance Source Contract

The GTN Balance page (`/?section=gtn-balance`) is local-dev only while the
Criterion workflow is staged. It is hidden from Vercel navigation, direct
section routing is disabled on Vercel, and
`GET /api/criterion/gtn-pipeline-balance` returns 404 outside local Next.js
runs.

Source system: Criterion Snowflake `PRODUCTION.PIPELINES`.

Primary source tables:

- `PIPELINES.METADATA`
- `PIPELINES.NOMINATION_POINTS`
- `PIPELINES.NOMINATION_SEGMENTS`
- `PIPELINES.MAX_POINT_FLOW` for verification context

Required pipeline key: `TSP_SHORT = '079'`.

The API accepts bounded params `date=YYYY-MM-DD` and `refresh=1`. Without a
date, it selects the latest complete GTN gas day with Intraday 3
(`CYCLE_ID = 5`) coverage for the checked-in required plant and segment
mappings. With an explicit date, it selects the latest available nomination
cycle for that date so current-day Evening-cycle data can be inspected.

The response returns `reportDate`, `latestAvailableDate`, `dataAsOf`,
`sourceContract`, `flowSummary`, `componentBalance`, `plantNoms`, `capacity`,
and `diagnostics`. Runtime SQL and auditable point/category mappings live under
`frontend/sql/criterion-gtn-pipeline-balance/runtime`. Verification SQL lives
under `frontend/sql/criterion-gtn-pipeline-balance/verification` and covers
point inventory, required mapping uniqueness, plant mapping checks, date
completeness, and corridor reconciliation.

Plant MW values are nomination-derived estimates using the exposed heat-rate
assumption in the plant SQL mapping. They are not metered generation values or
Research Viewer modeled demand splits.

The bounded API routes are:

```text
GET /api/map/pipelines
GET /api/map/search?q=<term>&limit=1..100
GET /api/map/locations?pipeline=<short_name>&limit=1..5000
GET /api/map/locations?locationRoleId=1,2&limit=1..5000
GET /api/genscape-noms/filters?pipelines=<short_name>
GET /api/genscape-noms?start=YYYY-MM-DD&end=YYYY-MM-DD&pipeline=<short_name>&limit=1..5000&includeCount=false
GET /api/genscape-noms/map?start=YYYY-MM-DD&end=YYYY-MM-DD&pipeline=<short_name>&limit=1..3000
GET /api/criterion/gtn-pipeline-balance?date=YYYY-MM-DD&refresh=1
```

Because `natgas.nominations` is a large fact table, Genscape fact routes require
`start`, `end`, and at least one metadata filter. Health checks use small
sample windows and `includeCount=false`.

Run the endpoint health check after a local build or production deploy:

```bash
npm run check:api -- --base-url=http://localhost:3000 --cache-bust
npm run check:api -- --base-url=https://frontend-helioscta.vercel.app --cache-bust
npm run check:api -- --filter=NAV --base-url=https://frontend-helioscta.vercel.app
npm run check:api -- --filter="Back Office" --base-url=https://frontend-helioscta.vercel.app --allow-slow
npm run warm:backoffice -- --base-url=https://frontend-helioscta.vercel.app
npm run check:perf:backoffice -- --url="https://frontend-helioscta.vercel.app/?view=backoffice-nav-daily-position-sheet" --allow-slow
npm run check:perf:backoffice -- --base-url=https://frontend-helioscta.vercel.app --all --allow-slow
npm run check:perf:backoffice -- --base-url=https://frontend-helioscta.vercel.app --view=backoffice-nav-daily-position-sheet --api-cache-bust --allow-slow
```

The checker calls each production API route, parses `Server-Timing`, and fails
when a route is broken or over its route latency budget. For protected Vercel
deployments, set `HELIOS_API_HEALTH_BYPASS_TOKEN`; the checker sends it as the
`x-vercel-protection-bypass` header. Use `--filter=<text>` to run a focused
subset of endpoints. Use `--require-timing` for local checks where
`Server-Timing` should be present; production Vercel responses may omit that
header, in which case the checker falls back to total request time.

Use `check:perf:backoffice` for the user-facing loop. It opens a fresh
Playwright browser context for desktop and mobile samples, waits until the Back
Office view is actually ready, and reports ready p95 plus the slowest Back
Office API calls and cache headers. Use `--target-ms=<n>` to tighten the page
budget and remove `--allow-slow` in CI when the route is expected to pass. Use
`--all` to walk the production Back Office views, and `--api-cache-bust` when
you want the browser page to stay stable but force its Back Office API requests
through uncached route work.

Use `warm:backoffice` before reviewing a production deployment when the target
is repeat navigation responsiveness rather than cold database latency. Back
Office APIs still keep Vercel CDN caching disabled, but routes that are safe to
reuse expose a five-minute private browser cache and server-side route cache.
The NAV Daily Position Sheet initial payload intentionally omits option ladder
detail rows; the selected option month is loaded through
`detail=option&optionDetail=1` after the futures matrix is ready.

## Vercel

Configure the Vercel project root as `frontend`. Production access is expected
to be handled by Vercel Authentication, SSO, or project access, not app-level
auth.
