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
GET /api/power-lmps?iso=pjm&product=da&date=YYYY-MM-DD
GET /api/power-lmps?iso=ercot&product=rt&date=YYYY-MM-DD&source=unverified
GET /api/power-lmps?iso=isone&product=rt&date=YYYY-MM-DD&source=verified
GET /api/power-lmps?iso=caiso&product=rt&date=YYYY-MM-DD&source=unverified
GET /api/power-lmp-settles?iso=pjm&start=YYYY-MM-DD&end=YYYY-MM-DD&hub=WESTERN%20HUB&component=total&rtSource=unverified
GET /api/pjm-da-lmps?date=YYYY-MM-DD
GET /api/pjm-rt-lmps?date=YYYY-MM-DD&source=unverified
GET /api/pjm-lmp-settles?start=YYYY-MM-DD&end=YYYY-MM-DD&hub=WESTERN%20HUB&component=total&rtSource=unverified
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
GET /api/pjm-outages?view=forecast&region=RTO
GET /api/pjm-outages?view=seasonal&region=RTO
GET /api/pjm-load-growth-yoy?loadArea=DOM&stationId=KRIC&region=PJM&lookbackDays=56&dateMode=lookback&loadShape=flat&dayType=all
GET /api/map/pipelines
GET /api/map/search?q=TRANSCO&limit=5
GET /api/map/locations?pipeline=TRANSCO&limit=25
GET /api/genscape-noms/filters?pipelines=TRANSCO
GET /api/genscape-noms?start=YYYY-MM-DD&end=YYYY-MM-DD&pipeline=TRANSCO&limit=50&includeCount=false
GET /api/genscape-noms/map?start=YYYY-MM-DD&end=YYYY-MM-DD&pipeline=TRANSCO&limit=200
GET /api/nav-positions?productGroup=Power&productRegion=PJM
GET /api/nav-positions/drilldown?productGroup=Power&productRegion=PJM&limit=100&drilldown=<json>
GET /api/ice-trade-blotter/raw?date=YYYY-MM-DD
GET /api/ice-trade-blotter/raw/drilldown?date=YYYY-MM-DD&limit=100&drilldown=<json>
```

Email/report links can open the PJM DA LMP page directly into the single-day
view:

```text
/?section=pjm-da-lmps&iso=pjm&view=single-day&product=rt&source=verified&date=YYYY-MM-DD&hub=WESTERN%20HUB&component=all&refresh=1
```

The Power LMPs page accepts `iso=pjm|ercot|isone|caiso` and exposes ISO tabs in the
order `PJM | ERCOT | ISO-NE | CAISO` before the `DA LMPs | RT | DART` product tabs.
PJM links without `iso` still default to PJM. ERCOT uses total settlement point
prices only, so component controls are constrained to `Total`; ERCOT RT is
hourly-averaged from promoted 15-minute settlement point prices. ISO-NE RT
maps `source=verified` to final hourly LMPs and `source=unverified` to
preliminary hourly LMPs. CAISO reads `caiso.da_lmps` and `caiso.rt_lmps` for
SP15/NP15 trading hubs; CAISO RT is hourly-averaged from promoted five-minute
OASIS intervals.

Local development also exposes a clearly separated `DEV` sidebar section:

```text
GET /api/pjm-da-model?date=YYYY-MM-DD&cutoff=YYYY-MM-DDTHH:MM
GET /api/spark-spread-evolution?sparkProduct=PJM_WH_RT_TETCO_M3_7X&strip=H
GET /api/ice-trade-blotter/daily-settlements?scope=short_pjm
GET /api/ice-trade-blotter/product-dictionary?scope=short_pjm
GET /api/gas-daily-prices?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
GET /api/pjm-price-duration-curves?hub=WESTERN%20HUB&month=7&years=2021,2022,2023,2024,2025&hourFilter=weekday_onpeak
GET /api/dev/clear-street-trades?limit=500
GET /api/pjm-generation?endDate=YYYY-MM-DD&lookbackDays=7
GET /api/pjm-tightness-lookback?date=YYYY-MM-DD
GET /api/pjm-price-view?date=YYYY-MM-DD
GET /api/weather/hourly-temps?region=PJM&observedLookbackDays=3&forecastRun=primary
GET /api/weather/hourly-forecast?region=PJM&station=PJM&forecastRun=primary
GET /api/weather/wsi-forecast-map?region=PJM&date=YYYY-MM-DD&forecastRun=primary
GET /api/pjm-net-load-forecast-explorer?source=pjm
GET /api/pjm-net-load-forecast-explorer?source=meteologica
GET /api/pjm-net-load-forecast-differences?source=pjm&area=RTO&date=YYYY-MM-DD&lookbackHours=72
GET /api/pjm-net-load-forecast-differences?source=meteologica&area=WEST&date=YYYY-MM-DD&lookbackHours=72
GET /api/pjm-net-load-forecast-date-compare?source=pjm&area=RTO&baseDate=YYYY-MM-DD&compareDate=YYYY-MM-DD
GET /api/pjm-net-load-forecast-date-compare?source=meteologica&area=WEST&baseDate=YYYY-MM-DD&compareDate=YYYY-MM-DD
GET /api/pjm-actuals-regime-scatter?loadArea=RTO&generationArea=RTO&stationId=PJM&hub=WESTERN%20HUB&start=YYYY-MM-DD&end=YYYY-MM-DD
GET /api/pjm-forecast-price-analogs?source=pjm&loadArea=RTO&generationArea=RTO&stationId=PJM&hub=WESTERN%20HUB&seasonStart=05-01&seasonEnd=08-31&lookbackYears=3&includeCurrentYear=1
GET /api/cache/warm-price-distributions?run=1
GET /api/pjm-ops-summary?date=YYYY-MM-DD
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

## Local DEV PJM Price Duration Curves Source Contract

The Price Analytics duration-curve view reads historical hourly LMPs with
`helios_readonly` from `pjm.da_hrl_lmps`, `pjm.rt_hrl_lmps`, and
`pjm.rt_unverified_hrl_lmps`.

Source system: PJM Data Miner 2 hourly LMP feeds.

Promoted table grain:
DA and verified RT are keyed by
`datetime_beginning_utc x pnode_id x pnode_name x row_is_current x version_nbr`.
Unverified RT is keyed by `datetime_beginning_utc x pnode_name x type`.

The route `GET /api/pjm-price-duration-curves` accepts bounded params:
`market=rt|da`, `rtSource=verified|unverified`, `hub`, `component`,
`month`, comma-separated `years`, `hourFilter`, and optional `threshold`.
Each selected year's hourly prices are sorted descending. The x-axis is
exceedance share, not chronological time. `weekday_onpeak` is NERC
business-day HE8-23, and `offpeak` includes NERC off-peak days plus
business-day HE1-7/HE24.

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
dbt/azure_postgres/models/positions_and_trades_v2/nav_positions/frontend/nav_frontend_positions_latest.sql
dbt/azure_postgres/models/positions_and_trades_v2/nav_positions/frontend/nav_frontend_positions_all_history.sql
```

Promote compiled SQL into the frontend/backend generated artifact paths with:

```powershell
cd dbt\azure_postgres
dbt compile --profiles-dir . --select path:models/positions_and_trades_v2/nav_positions
dbt test --profiles-dir . --select tag:frontend_contract
python scripts\promote_positions_trades_sql.py
```

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
from `ice_trade_blotter.file_manifest`. The page is production-visible at
`/?section=ice-trade-blotter`. The production endpoints are
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

This page is visual inspection only. It does not add dbt models, product
standardization, product matching, frontend cache tables, backend writes,
scheduled jobs, or new credentials.

Access and caching match NAV Positions: the server-rendered home page hides the
Positions section for unauthorized users, both ICE raw APIs fail closed with
`404` through the same app-auth gate, and responses use
`Cache-Control: private, no-store` plus `Vercel-CDN-Cache-Control: no-store`.

## Local DEV Clear Street Trades Source Contract

The Trades DEV view reads a promoted dbt mart from
`frontend/sql/clear-street-trades/marts/eod_all_history.sql`. That file is
generated by dbt from
`dbt/azure_postgres/models/positions_and_trades_v2/clear_street_eod_transactions/marts/cs_65_eod_all_history.sql`
and promoted into the frontend with:

```powershell
cd dbt\azure_postgres
dbt compile --profiles-dir . --select path:models/positions_and_trades_v2
python scripts\promote_positions_trades_sql.py
```

The underlying source table is `clear_street.eod_transactions`; dbt owns the
cleanup, account lookup, product matching, `rule_status`, and vendor export
code logic. The frontend route does not run product matching rules in
TypeScript.

The page is local-only and appears in the local `DEV` sidebar section at
`/?section=clear-street-trades`; Vercel builds hide the page and return `404`
from `GET /api/dev/clear-street-trades`.

The route accepts bounded params `limit=25..2000` and optional `search`. It
uses the same product-code null criteria as the backend MUFG email
warning: product grouping and region are blank/null, and at least one ICE, CME,
or Bloomberg product code is blank/null. The API highlights the latest SFTP
date and latest upload as the daily review file, then lets Postgres join those
latest-file signatures back to all matching history. It does not pull all
history into TypeScript, does not mutate data, and does not create a cache
table.

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

The Power ICE Settles view reads PJM short-term and monthly settlement marks
with `helios_readonly` from PJM LMPs and `ice_python.settlements`, using the
frontend trade-blotter product dictionary for the displayed contract catalog.
It appears in the `Pricing` sidebar section at `/?section=ice-settlements`;
the page and supporting ICE settle routes are production-visible on Vercel.

Source systems: PJM hourly LMP tables and ICE Python / ICE XL local Windows
settlement tables.

Primary settle grain:
`market_date x cc x hub x contract x settlement_source_key`.

The PJM short-term scope is the default and only exposed UI scope for this
page. It covers `PDP`, `PWA`, `PDA`, `PJL`, `PDO`, and `ODP` with daily,
weekly, and weekend contract codes. The route
`GET /api/ice-trade-blotter/daily-settlements?scope=short_pjm` returns daily
settle rows and metadata. The product dictionary route exposes the rules used
for mapping trade-blotter product codes to settlement sources. The copied
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

## Local DEV PJM Tightness Lookback Source Contract

The Tightness Lookback DEV view is an adequacy-first lookback for a selected
PJM operating date, defaulting to yesterday in PJM EPT. It reads promoted PJM
operational source tables with `helios_readonly`; it does not create a
database model, frontend cache table, migration, or new credential requirement.

Primary sources are `pjm.hrl_load_metered` with fallback to
`pjm.hrl_load_prelim` for RTO load, `pjm.rt_dispatch_reserves` for the tightest
hourly reserve row, `pjm.dispatched_reserves` and
`pjm.reserve_market_results` for shortage and reserve-price confirmation, and
`pjm.rt_fivemin_hrl_lmps` with fallback to `pjm.rt_unverified_hrl_lmps` for RT
hub prices. Context sources are `pjm.rt_marginal_value`,
`pjm.five_min_tie_flows` or `pjm.act_sch_interchange`, `pjm.gen_by_fuel`,
`pjm.day_gen_capacity`, `pjm.rt_and_self_ecomax`, `pjm.gen_outages_by_type`,
and `pjm.frcstd_gen_outages`.

The route `GET /api/pjm-tightness-lookback` accepts optional
`date=YYYY-MM-DD`. The response returns selected-date coverage by source, one
hourly row per EPT HE with load/reserve/price/generation/interchange/constraint
fields, a constraint leaderboard, outage context, and summary objects for peak
load, tightest reserve margin, max deficit, max reserve MCP, and max Western
Hub RT price. Missing secondary sources are exposed as nulls and coverage
counts rather than treated as route failures. The page appears in the local
`DEV` sidebar section at `/?section=pjm-tightness-lookback`; Vercel builds hide
the page and return `404` from the API route.

## Local DEV PJM Price View Source Contract

The Price View DEV page is a source-by-hour matrix for inspecting one PJM
operating date before building a fuller dispatch-curve workflow. It reads with
`helios_readonly` from `pjm.hrl_load_metered`, `pjm.hrl_load_prelim`,
`pjm.gen_by_fuel`, `pjm.rt_hrl_lmps`, and `ice_python.settlements`; it does not
create a database model, frontend cache table, migration, or new credential
requirement.

The default route `GET /api/pjm-price-view` accepts optional
`date=YYYY-MM-DD` and defaults to the latest complete date in the recent source
window. It returns one matrix row each for selected RTO load, `gen_by_fuel`
wind, `gen_by_fuel` solar, derived net load, verified Western Hub RT LMP, Tetco
M3 gas, and derived heat rate. Tetco M3 gas uses ICE physical next-day
`XZR D1-IPG` WVAP Close from `ice_python.settlements`, aligned to hourly PJM
timestamps by UTC so the 09:00 CT gas day rolls at 10:00 Eastern. Heat rate is
`Western Hub RT LMP / Tetco M3 WVAP Close`. The UI shows `Metric`, optional
`Data Source`, then `HE1` through `HE24`; verification status and a short
source note are embedded in the toggleable `Data Source` cell.

The same payload returns selected-day chart points for hourly net load versus
hourly heat rate and Western Hub RT price. The chart defaults to heat rate and
can toggle back to RT price. Historical binned dispatch curves are a follow-on
slice once the single-date data shape is validated.

The same endpoint also supports
`GET /api/pjm-price-view?view=da-net-load-scatter&lookbackDays=30&hub=WESTERN%20HUB`
for the `30D DA Scatter` tab. `lookbackDays` is bounded from 7 to 90 and means
the latest complete source dates to return. The scatter reads current
`pjm.da_hrl_lmps` DA total LMP rows for the selected hub, selected RTO load with
the same metered/prelim fallback, `pjm.gen_by_fuel` wind and solar, and ICE
physical Tetco M3 `XZR D1-IPG` gas from `ice_python.settlements`. It returns
one point per complete hourly EPT interval with date, HE, DA LMP, load GW, wind
GW, solar GW, derived net load GW, Tetco M3 gas, and derived DA heat rate. The
UI colors points by hour group: overnight HE1-7 and HE24, morning HE8-11,
afternoon HE12-17, and evening HE18-23.

The DA scatter also accepts
`dateMode=month-years&months=6,7&years=2024,2025,2026` to inspect one month or
a selected collection of months across selected calendar years. In
`month-years` mode, `lookbackDays` is retained in the payload for control
state, but the SQL window is driven by the selected years and filtered to the
selected months. Additional scatter filters are applied client-side for day
type, hour group, individual HE, X-axis metric, Y-axis metric, and numeric X/Y
ranges.

Load uses latest `pjm.hrl_load_metered` direct `RTO` rows when all 24 hourly
rows exist for the operating date. When metered RTO is unavailable, the route
falls back to summed promoted preliminary load component areas `AEP`, `AP`,
`ATSI`, `DAY`, `DEOK`, `DOM`, `DUQ`, `EKPC`, `MIDATL`, and `NI`. Net load is
derived as `load - wind - solar`. The page appears in the local `DEV` sidebar
section at `/?section=pjm-price-view`; Vercel builds hide the page and return
`404` from the API route.

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

## Local DEV PJM DA Model Source Contract

The DA Model page reads Meteologica Western Hub DA price forecasts and matching
PJM actual DA LMPs directly from source tables with `helios_readonly`:
`meteologica.usa_pjm_western_hub_da_power_price_forecast_hourly` and
`meteologica.usa_pjm_western_hub_da_power_price_forecast_ecmwf_ens_hourly`,
plus `pjm.da_hrl_lmps`.

Source system:
Meteologica xTraders Western Hub DA price deterministic and ECMWF ENS feeds.

Source table grain:
`content_id x update_id x forecast_period_start`. For a selected delivery
date, the API selects the latest `issue_date` available in each source table
for that date at or before the optional cutoff.
Actual DA values are pulled from `pjm.da_hrl_lmps` where
`row_is_current = true`, `pnode_name = 'WESTERN HUB'`, and
`datetime_beginning_ept::date` equals the selected target date.

The DA Model page appears in the local `DEV` sidebar section at
`/?section=pjm-da-model`; Vercel builds hide the page and return `404` from
`GET /api/pjm-da-model`.

The route `GET /api/pjm-da-model` accepts optional `date=YYYY-MM-DD` and
`cutoff=YYYY-MM-DDTHH:MM`. The cutoff is interpreted as a UTC issue timestamp
and restricts each source to `issue_date <= cutoff`. Without a date it selects
the first available future delivery date under the cutoff, or the first
available future delivery date when no cutoff is supplied. The response returns
available delivery dates, the applied cutoff, deterministic and ensemble issue
timestamps, PJM actual update timestamp, HE1-HE24 series (`Actual DA`, `Det`,
`ENS Avg`, `ENS Bottom`, `ENS Top`), derived width/IQR rows, and
OnPeak/OffPeak/Flat block values. `OnPeak` is HE8-23, and `OffPeak` is HE1-7
plus HE24.

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

## PJM Price Distributions Source Contract

The Price Distributions page is a local DEV-only workspace while the workflow
is still being designed. It appears in the local `DEV` sidebar section at
`/?section=pjm-price-distributions`. The previous
`/?section=pjm-actuals-regime-scatter` section id is accepted locally as a
backward-compatible alias and maps to Price Distributions. Vercel builds hide
the page and production URL parsing falls back to the default LMPs section.

The current dev view uses the simplified forward analog workflow. It uses either
PJM Data Miner (`source=pjm`) or Meteologica (`source=meteologica`) RTO load,
wind, and solar forecasts with WSI forecast temperatures to build a
forecast-conditioned historical RT price distribution. Net load is always
derived as `load - solar - wind`, and the v1 analog score uses normalized
temperature and net-load similarity only. The analog pool defaults to 40 rows
per target HE, clamps to 20-100 rows per HE, and the frontend shows
selected-hour median/max distance as the similarity quality check.

Derived formula:
`net_load_mw = gross_load_mw - wind_mw - solar_mw`.

The route `GET /api/pjm-actuals-regime-scatter` accepts bounded params for
load area, wind/solar area, station, hub, RT source, price component, date
range, season, hour/day filters, price/outage bounds, color regime, and max
points. It samples matched hourly rows after server-side filters and does not
create a database model, table, or materialized cache. The historical scatter
endpoint remains hidden outside local Next.js runs and returns `404` on Vercel.

Outage joins are retained in the API payload for future diagnostics but are not
part of the simplified visible workflow or default analog ranking.

`GET /api/pjm-forecast-price-analogs` uses `helios_readonly`, bounded inputs,
Next Data Cache with a 10-minute revalidate window in local/dev, and
process-local in-flight request dedupe. The cache makes warmed and repeated
configs fast, but a cold uncached config can still take longer because it
rebuilds the historical analog pool from source tables on demand. The route is
local-only and returns `404` on Vercel.
The diagnostic headers `X-Helios-Response-Cache` and `X-Helios-Cache-Layer`
distinguish process-memory hits, process in-flight dedupe, forced refreshes,
and the shared-cache-or-origin path. They do not distinguish a Next/Vercel Data
Cache hit from an origin SQL rebuild after the request has entered the cached
loader.

`GET /api/cache/warm-price-distributions` is a protected no-store warmer for
Price Distributions. It warms complete forecast date lookups for PJM and
Meteologica every run, then alternates one full default analog payload between
PJM and Meteologica. Local development may call it with `?run=1`. The route is
local-only, returns `404` on Vercel, and is not included in the committed
Vercel Cron schedule.

## PJM Ops Sum Source Contract

The Ops Sum page reads promoted PJM Operations Summary rows with
`helios_readonly` from `pjm.ops_sum_frcstd_tran_lim`,
`pjm.ops_sum_frcst_peak_rto`, `pjm.ops_sum_frcst_peak_area`,
`pjm.ops_sum_prjctd_tie_flow`, and `pjm.ops_sum_prev_period`.

Source system: PJM Data Miner Operations Summary `ops_sum_frcstd_tran_lim`,
`ops_sum_frcst_peak_rto`, `ops_sum_frcst_peak_area`,
`ops_sum_prjctd_tie_flow`, and `ops_sum_prev_period`.

Promoted table grain:
The forecast peak tables are keyed by `projected_peak_datetime_utc x area`,
forecast transfer limits by `projected_peak_datetime_utc x transfer_limit_name`,
projected tie flow by `projected_peak_datetime_utc x interface`, and previous
period actuals by `datetime_beginning_utc x area`. The route is keyed by a
selected Ops Summary date and returns collapsible cards for Capacity Peak RTO,
Forecast Transfer Limits, Projected Scheduled Tie Flow, Capacity Peak Zones,
and Previous Period Actuals. The default view keeps RTO, transfer limits, and
tie flow open; Zones and Previous Period Actuals start collapsed because they
are detail-heavy or use a different actuals window. Metric cells show the
selected value and seven-day inline trend by default. Forecast peak,
transfer-limit, and tie-flow cards also expose all-history max/min values
through the selected date behind a UI toggle. Previous Period Actuals use the
latest actual operating date on or before the selected date and currently omit
all-history extrema to keep the route responsive. That Actuals card
shows `datetime_beginning_ept`, `datetime_beginning_utc`, actual load, and
dispatch rate only; true forecast error should be built from a joined
forecast-vs-actual view rather than inferred from
`ops_sum_prev_period.area_load_forecast`. `generated_at_ept` is exposed as a
freshness timestamp only; it is not used as a frontend uniqueness key. The dev
endpoint gating does not apply to Ops Sum.

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

The bounded API routes are:

```text
GET /api/map/pipelines
GET /api/map/search?q=<term>&limit=1..100
GET /api/map/locations?pipeline=<short_name>&limit=1..5000
GET /api/map/locations?locationRoleId=1,2&limit=1..5000
GET /api/genscape-noms/filters?pipelines=<short_name>
GET /api/genscape-noms?start=YYYY-MM-DD&end=YYYY-MM-DD&pipeline=<short_name>&limit=1..5000&includeCount=false
GET /api/genscape-noms/map?start=YYYY-MM-DD&end=YYYY-MM-DD&pipeline=<short_name>&limit=1..3000
```

Because `natgas.nominations` is a large fact table, Genscape fact routes require
`start`, `end`, and at least one metadata filter. Health checks use small
sample windows and `includeCount=false`.

Run the endpoint health check after a local build or production deploy:

```bash
npm run check:api -- --base-url=http://localhost:3000 --cache-bust
npm run check:api -- --base-url=https://frontend-helioscta.vercel.app --cache-bust
npm run check:api -- --filter=NAV --base-url=https://frontend-helioscta.vercel.app
```

The checker calls each production API route, parses `Server-Timing`, and fails
when a route is broken or over its route latency budget. For protected Vercel
deployments, set `HELIOS_API_HEALTH_BYPASS_TOKEN`; the checker sends it as the
`x-vercel-protection-bypass` header. Use `--filter=<text>` to run a focused
subset of endpoints. Use `--require-timing` for local checks where
`Server-Timing` should be present; production Vercel responses may omit that
header, in which case the checker falls back to total request time.

## Vercel

Configure the Vercel project root as `frontend`. Production access is expected
to be handled by Vercel Authentication, SSO, or project access, not app-level
auth.
