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
The Azure SQL helper also accepts local alias names:
`AZURE_SQL_SERVER`, `AZURE_SQL_DATABASE`, `AZURE_SQL_USER`, and
`AZURE_SQL_PASSWORD`.

The local DEV-only Criterion Noms and GTN Balance pages read directly from
Criterion Snowflake. Set these server-only variables for local development:

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
GET /api/power-lmps?iso=pjm&product=da&date=YYYY-MM-DD
GET /api/power-lmps?iso=pjm&product=da&date=YYYY-MM-DD&metric=heat-rate&gasHub=gas_m3
GET /api/power-lmps?iso=ercot&product=da&date=YYYY-MM-DD&metric=heat-rate&gasHub=gas_hsc
GET /api/power-lmps?iso=ercot&product=rt&date=YYYY-MM-DD&source=unverified
GET /api/power-lmps?iso=isone&product=rt&date=YYYY-MM-DD&source=verified
GET /api/power-lmps?iso=caiso&product=rt&date=YYYY-MM-DD&source=unverified
GET /api/power-lmps?iso=miso&product=rt&date=YYYY-MM-DD&source=unverified
GET /api/power-lmps?iso=nyiso&product=rt&date=YYYY-MM-DD&source=unverified
GET /api/power-lmp-settles?iso=pjm&start=YYYY-MM-DD&end=YYYY-MM-DD&hub=WESTERN%20HUB&component=total&rtSource=unverified
GET /api/power-lmp-settles?iso=pjm&start=YYYY-MM-DD&end=YYYY-MM-DD&hub=WESTERN%20HUB&component=total&rtSource=unverified&metric=heat-rate&gasHub=gas_m3
GET /api/power-lmp-settles?iso=pjm&start=YYYY-MM-DD&end=YYYY-MM-DD&hub=WESTERN%20HUB&component=total&rtSource=unverified&metric=spark-spread&gasHub=gas_m3&sparkHeatRate=7
GET /api/power-lmp-settles?iso=miso&start=YYYY-MM-DD&end=YYYY-MM-DD&hub=INDIANA.HUB&component=total&rtSource=unverified&metric=heat-rate&gasHub=gas_chicago
GET /api/trading-calendars?calendar=all&year=YYYY&includeObserved=1
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
GET /api/salts/wx-adj-scrapes?season=summer&month=7&weatherMetric=conus_population_cdd&lookbackYears=2
GET /api/salts/forecast?lookbackWeeks=340
GET /api/criterion/noms?date=YYYY-MM-DD&states=PA,OH&limit=1000
GET /api/criterion/noms?date=YYYY-MM-DD&watchlistId=1&limit=1000
GET /api/criterion/watchlists
GET /api/criterion/watchlists/1
GET /api/criterion/gtn-pipeline-balance?date=YYYY-MM-DD&refresh=1
GET /api/nav-positions?productGroup=Power&productRegion=PJM
GET /api/nav-positions/drilldown?productGroup=Power&productRegion=PJM&limit=100&drilldown=<json>
GET /api/clear-street-trades?limit=500
GET /api/clear-street-trades/drilldown?limit=100&drilldown=<json>
GET /api/ice-trade-blotter/raw?date=YYYY-MM-DD
GET /api/ice-trade-blotter/raw/drilldown?date=YYYY-MM-DD&limit=100&drilldown=<json>
```

Email/report links can open the PJM DA LMP page directly into the single-day
view:

```text
/?section=pjm-da-lmps&iso=pjm&view=single-day&product=rt&source=verified&date=YYYY-MM-DD&hub=WESTERN%20HUB&component=all&refresh=1
```

The Power LMPs page accepts `iso=pjm|ercot|isone|caiso|miso|spp|nyiso` and exposes
ISO tabs in the order `PJM | ERCOT | ISO-NE | CAISO | MISO | SPP | NYISO` before the
`DA LMPs | RT | DART` product tabs.
PJM links without `iso` still default to PJM. ERCOT uses total settlement point
prices only, so component controls are constrained to `Total`; ERCOT RT is
hourly-averaged from promoted 15-minute settlement point prices. ISO-NE RT
maps `source=verified` to final hourly LMPs and `source=unverified` to
preliminary hourly LMPs. CAISO reads `caiso.da_lmps` and `caiso.rt_lmps` for
SP15/NP15 trading hubs; CAISO RT is hourly-averaged from promoted five-minute
OASIS intervals. MISO reads `miso.da_lmps`, `miso.rt_lmps_prelim`, and
`miso.rt_lmps_final` for Indiana Hub and the ICE-traded MISO hub family; MISO
RT maps `source=verified` to final hourly LMPs and `source=unverified` to
preliminary hourly LMPs. SPP reads `spp.da_lmps` and `spp.rt_lmps_prelim`.
NYISO reads `nyiso.da_lmps` and `nyiso.rt_lmps_prelim` for the promoted load
zones; NYISO RT is hourly-averaged from preliminary five-minute LBMP rows.
DA and RT LMP routes also accept `metric=heat-rate` for every promoted ISO.
Heat Rate mode divides the selected LMP component by the selected gas price,
uses `MMBtu/MWh`, and joins promoted long-form `ice_python_next_day_gas`
rows by ICE symbol and physical gas day. Market hours are converted from the
ISO market timezone to the 9:00 AM America/Chicago gas-day boundary. Heat-rate
payloads keep gas-day/trade-date/source metadata in `heatRateMetadata` and
leave DART and Compare Hubs price-only for v1.

Daily Settles also accepts `metric=spark-spread` with `sparkHeatRate`, default
`7.0` MMBtu/MWh. Spark Spread is calculated as total LMP minus gas price times
the selected heat-rate assumption, returns `$/MWh`, allows negative values, and
keeps the same gas metadata in `heatRateMetadata`. Spark Spread is daily-settles
only; direct `/api/power-lmps?metric=spark-spread` requests return `400`.

Supported heat-rate gas hubs by ISO:

```text
PJM: Tetco M3, Dominion South, Columbia TCO, Transco Z6 NY, Henry Hub, Tetco M2, Transco Z5 South, Transco Z5 North, Tennessee Z4 Marcellus, Transco Leidy, Chicago Citygate, MichCon
ERCOT: Houston Ship Channel, Waha, NGPL TX/OK, Henry Hub
ISO-NE: Algonquin Citygates, Iroquois Zone 2, Transco Z6 NY
CAISO: SoCal Citygate, PG&E Citygate
MISO: Chicago Citygate, MichCon, Northern Ventura, NGPL Midcontinent, Henry Hub, Houston Ship Channel, Waha, NGPL TX/OK, Columbia Gulf Mainline, ANR SE-T, Pine Prairie, Tetco WLA
SPP: NGPL Midcontinent, NGPL TX/OK, Waha, CIG Mainline
NYISO: Transco Z6 NY, Iroquois Zone 2, Algonquin Citygates, Tetco M3, Columbia TCO
```

Default gas-hub resolution is ISO-aware and may use the selected power hub when
there is a clear dashboard mapping: PJM Chicago/N Illinois/Chicago Gen map to
Chicago Citygate, AEP-Dayton/Ohio/AEP Gen and West Int map to Columbia TCO,
ATSI Gen maps to MichCon, Dominion maps to Transco Z5 South, Western maps to
Tetco M3, and Eastern/New Jersey map to Transco Z6 NY; ERCOT North maps
to NGPL TX/OK, ERCOT South/Houston to HSC, ERCOT West to Waha; CAISO SP15 to
SoCal Citygate and NP15 to PG&E Citygate; MISO Indiana/Illinois to Chicago,
Arkansas to NGPL Midcontinent, Louisiana to Henry Hub, Michigan to MichCon,
Minnesota to Northern Ventura, and Texas to HSC; SPP North to NGPL Midcontinent
and South to NGPL TX/OK; NYISO southeast zones to Transco Z6 NY and remaining
zones to Iroquois Zone 2. PJM Eastern Hub, New Jersey Hub, and West Int Hub are
single-hub approximations for now because Platts/PJM split those locations
across more specific gas locations. Explicit `gasHub` query params still
override these defaults; when `gasHub` is omitted, `/api/power-lmps` may use
optional `hub` and `/api/power-lmp-settles` uses the selected settles hub for
default gas resolution.

ERCOT gas-default confidence is strongest for `HB_HOUSTON -> Houston Ship
Channel` and `HB_WEST -> Waha`. `HB_NORTH -> NGPL TX/OK` is medium-confidence
as the promoted North Texas proxy. `HB_SOUTH -> Houston Ship Channel` remains a
single-hub approximation because the reviewed gas-location methodology defines
more specific South Texas, Katy, and East Texas locations that are not promoted
as app gas hubs yet.

## Power Settles Dashboard Source Contract

The Power Settles dashboard (`/?section=power-settles-dashboard`) is production
visible in Vercel. It summarizes DA, RT, and DART OnPk/OffPeak values for the
selected `total`, `energy`, `congestion`, or `loss` LMP component across
dashboard hub sets: all promoted PJM hubs (`WESTERN HUB`, `EASTERN HUB`,
`AEP-DAYTON HUB`, `DOMINION HUB`, `NEW JERSEY HUB`, `CHICAGO HUB`, `OHIO HUB`,
`N ILLINOIS HUB`, `AEP GEN HUB`, `ATSI GEN HUB`, `CHICAGO GEN HUB`,
`WEST INT HUB`); ERCOT `HB_NORTH`, `HB_SOUTH`, `HB_WEST`, `HB_HOUSTON`; ISO-NE
`.H.INTERNAL_HUB`; CAISO `TH_SP15_GEN-APND`, `TH_NP15_GEN-APND`; MISO
`INDIANA.HUB`, `ARKANSAS.HUB`, `ILLINOIS.HUB`, `LOUISIANA.HUB`,
`MICHIGAN.HUB`, `MINN.HUB`, `TEXAS.HUB`; SPP `SPPNORTH_HUB`,
`SPPSOUTH_HUB`; NYISO `WEST`, `GENESE`, `CENTRL`, `NORTH`, `MHK VL`,
`CAPITL`, `HUD VL`, `MILLWD`, `DUNWOD`, `N.Y.C.`, `LONGIL`. ERCOT
settlement point prices currently expose Total only, so ERCOT falls back to
Total when a component leg is selected.

The route `GET /api/power-settles-dashboard` accepts bounded params
`date=YYYY-MM-DD`, `rtSource=verified|unverified`,
`component=total|energy|congestion|loss`, `lookbackDays=1..14`,
`sparkHeatRate=4.0..20.0`, and `refresh=1`.
Without `date`, the route defaults to the previous America/Denver calendar
date. Without `rtSource`, Power Settles defaults to verified RT. Without
`sparkHeatRate`, Spark summaries default to `7.0` MMBtu/MWh. For PJM,
ISO-NE, and MISO, a hub falls back to unverified/preliminary RT when
verified/final RT is unavailable or less complete for the selected date; ERCOT,
CAISO, SPP, and NYISO display their single promoted RT source.
DART is derived as matched hourly `DA - RT` before OnPk, OffPeak, flat, and
peak-hour summaries are calculated. The payload includes one compact row per
dashboard hub, latest DA/RT source dates, source-table names, effective RT
source metadata, as-of timestamps, status, and detail links into the Power LMP
Daily Settles view with `iso`, `date`, `hub`, RT source, and effective
component in the URL. The dashboard renders compact ISO summary cards with hub
rows and LMP links as an ordered report-card body: PJM first, ERCOT second,
then the remaining dashboard ISOs in payload order. Each ISO card is
collapsible and opens by default. A standalone Summary card renders before PJM
with report date, ISO count, hub coverage, fallback and
single-source RT counts, plus per-ISO coverage chips so newly included
dashboard ISOs are visible before the ISO cards. The Summary card also renders
one representative hub per ISO, except CAISO renders both dashboard hubs. The
Summary card splits those rows into separate LMP and HR table bands: LMPs show
OnPk/OffPeak DA, RT, and DART; HRs show OnPk/OffPeak DA HR, RT HR, and Gas;
Sparks show OnPk/OffPeak DA Spark, RT Spark, and Gas with the active Spark HR.
LMP, HR, and Spark inputs render as separate content-sized table bands on one
horizontal row inside the ISO card, with clear space between table sections.
The ISO card body scrolls horizontally for wide table sets. Future dashboard
ISOs returned by the route appear after ERCOT
automatically. Hourly profiles and hub exploration stay in the LMP page, and
the dashboard intentionally does not render a Recent Daily Flat surface or
adders/reserves surface.

Each dashboard row also includes an `inputs` block for the row's default
heat-rate gas hub. The block carries the gas hub key/label/symbol, gas metadata
status, latest gas day/trade date/as-of fields, OnPk/OffPeak/flat gas price
summaries, and DA/RT heat-rate summaries derived from the same hourly power
prices used in the row, plus DA/RT Spark summaries in `$/MWh`. Spark uses
total LMP regardless of the selected Power Settles component, allows negative
values, and uses the row's mapped gas hub and active `sparkHeatRate`. The live
dashboard keeps LMP cells price-only and renders DA HR, RT HR, and Gas in
separate HR table bands, plus DA Spark, RT Spark, and Gas in separate Spark
bands. LMP tables link to price Daily Settles, HR tables link to Daily Settles
in heat-rate mode with the row's default gas hub, and Spark tables link to
Daily Settles with `metric=spark-spread`, `component=total`, the row's default
gas hub, and the active `sparkHeatRate`. The daily email body renders only the
representative Summary LMP, HR, and Spark table bands, plus the full Vercel
dashboard report link for per-ISO sections and all dashboard hubs. LMP tables
stay price-only, HR tables show DA HR, RT HR, Gas, Gas Hub label, and HR
links, Spark tables show DA Spark, RT Spark, Gas, Gas Hub label, Spark HR, and
Spark links, and email HR and Spark tables do not show ICE gas symbols or a Gas
As Of column. Email HTML omits source and status columns, RT-source badges and
completeness status details. Adders and reserves remain owned by the Power LMPs
Adders & Reserves view and are intentionally excluded from the Power Settles
dashboard payload and page.

The route uses `observedJsonRoute`, process-local route caching, and
`Cache-Control: public, s-maxage=300, stale-while-revalidate=60`. It does not
read protected Back Office data, create cache tables, add credentials, or
mount the full LMP dashboard multiple times.

`GET /api/power-settles-dashboard/email-html` accepts the same bounded report
params plus optional `surface=inline|attachment` and returns `text/html` for
previewing the actual daily inline email body without sending or queueing email.
`surface=inline` remains accepted. Legacy `surface=attachment` requests return
the same inline body with `X-Helios-Email-Surface: inline`; there is no
standalone HTML attachment preview.

```text
GET /api/power-settles-dashboard/email-html?refresh=1&surface=attachment
GET /api/power-settles-dashboard/email-html?refresh=1&surface=inline
```

Vercel owns the scheduled Power Settles email workflow. `GET
/api/cron/power-settles-email` is invoked by Vercel Cron, verifies
`Authorization: Bearer ${CRON_SECRET}`, builds the report with verified RT by
default, and lets the Power Settles data builder fall back to the
unverified/preliminary RT source per hub when verified/final data is unavailable
or less complete. The cron route always
publishes to the `power-settles-email` Vercel Queue topic after the report
payload builds; dashboard completeness is delivery metadata in the email body,
not a send gate. The Vercel Cron schedule runs once daily at
`11:00` UTC (`5:00 AM MDT` / `4:00 AM MST`), after the overnight VM RT LMP
polling window has closed. The cron route queues at most one email for the
report date; the deterministic queue idempotency key remains a
duplicate-delivery guard.
`POST
/api/queues/power-settles-email` is a private queue consumer configured through
`vercel.json`; it renders the summary-only inline email body, then sends
through Microsoft Graph without HTML attachments. The daily email payload uses
the same dashboard ISO set (`PJM`, `ERCOT`, `ISO-NE`, `CAISO`, `MISO`, `SPP`,
`NYISO`). The email body renders only representative Summary LMP, HR, and Spark
table bands. Per-ISO hub sections live in the full Vercel dashboard report
linked from the email CTA.
This workflow does not use
`ops.email_notification_outbox`.

The current Power Settles email recipients are intentionally pinned to
`aidan.keaveny@helioscta.com` and `kapil.saxena@helioscta.com`;
`HELIOS_EMAIL_RECIPIENTS` is not used for this Vercel workflow until the
audience is deliberately widened. The deterministic queue idempotency key is
`power-settles:<date-or-latest>:<rtSource>:<component>:<lookbackDays>:<sparkHeatRate>:<recipient>`.

## Local DEV PJM DA Model Runtime

The PJM DA Model page (`/?section=pjm-da-model`) is local-dev only while the
PJM DA model frontend workflow is being staged. It is hidden from Vercel
navigation and `GET /api/pjm-da-meteo-baseline-price` returns `404` outside
local Next.js runs. The legacy section alias
`/?section=pjm-da-meteo-baseline-price` still resolves locally to the same
page.

The staged page currently exposes internal tabs for `Overview`, `DA Forecast`,
`Inputs`, and `Replay`. `DA Forecast` and `Inputs` are implemented; `Overview`
and `Replay` are placeholders. The frontend intentionally does not render a
lineage page or lineage panel in this staging pass.

This route does not read model output/cache tables. It runs the model in
TypeScript by reading the dbt-promoted SQL artifacts committed under
`backend/modelling/pjm_da_models/sql_inputs/`, translating generated
`%(name)s` placeholders to `pg` positional parameters, and executing those
queries against `helios_prod` with `helios_readonly`. The same promotion script
also writes a Vercel-safe mirror under
`frontend/sql/pjm_da_model/sql_inputs/` because the Vercel project root is
`frontend`.

Relevant promoted SQL artifacts:

```text
backend/modelling/pjm_da_models/sql_inputs/available_target_dates.sql
backend/modelling/pjm_da_models/sql_inputs/meteo_da_price_forecast_hourly.sql
backend/modelling/pjm_da_models/sql_inputs/actual_da_lmps_hourly.sql
backend/modelling/pjm_da_models/sql_inputs/manifest.json
frontend/sql/pjm_da_model/sql_inputs/manifest.json
```

The route accepts bounded params `horizon=tomorrow|next3|full`,
`runDate=YYYY-MM-DD`, `targetDate=YYYY-MM-DD`, `limit=1..60`,
`includeActuals=0|1`, and `refresh=1`. Defaults preserve the Python model
behavior: 10:00 America/New_York cutoff converted to UTC, `lead_days=1` for
tomorrow, and `lead_days=null` for next-three/full prediction-window runs.

Caching is non-persistent only: the server route uses process-local memory
cache with `refresh=1` bypass, and the component uses the shared client JSON
cache. No model results are written to Postgres.

Local development also exposes a clearly separated `DEV` sidebar section:

```text
GET /api/spark-spread-evolution?sparkProduct=PJM_WH_RT_TETCO_M3_7X&strip=H
GET /api/ice-trade-blotter/daily-settlements?scope=short_pjm
GET /api/ice-trade-blotter/product-dictionary?scope=short_pjm
GET /api/pjm-da-meteo-baseline-price?horizon=tomorrow
GET /api/gas-daily-prices?tradeDate=YYYY-MM-DD
GET /api/salts/wx-adj-scrapes?season=summer&month=7&weatherMetric=conus_population_cdd&saltsMetric=salts_total
GET /api/pjm-price-duration-curves?hub=WESTERN%20HUB&month=7&years=2021,2022,2023,2024,2025&hourFilter=weekday_onpeak
GET /api/eia-generation?region=US48&season=summer&date=YYYY-MM-DD
GET /api/pjm-generation?endDate=YYYY-MM-DD&lookbackDays=7
GET /api/pjm-tightness-lookback?date=YYYY-MM-DD
GET /api/weather/hourly-temps?region=PJM&observedLookbackDays=3&forecastRun=primary
GET /api/weather/hourly-forecast?region=PJM&station=PJM&forecastRun=primary
GET /api/weather/wsi-forecast-map?region=PJM&date=YYYY-MM-DD&forecastRun=primary
GET /api/weather/wsi-wdd-forecast-changes?region=CONUS&metric=gas_hdd
GET /api/weather/wsi-wdd-forecast-changes?region=CONUS&metric=population_cdd&periodMode=eiaWeeks&report=1
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

## ICE Power Analytics Source Contract

The ICE Power Analytics view reads non-option ICE settlement marks with
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

## ICE Gas Cash & Term Source Contract

The ICE Gas Cash & Term view reads ICE physical gas cash, BalMo, and monthly
settlement marks with `helios_readonly` from `helios_prod.ice_python.settlements`.
It appears in the `Pricing` sidebar section at `/?section=gas-prices`; the page
and supporting ICE Gas Cash & Term API routes are production-visible on Vercel.

Source system: ICE Python / ICE XL local Windows runtime.

Promoted table grain: `trade_date x symbol`, with primary key
`(trade_date, symbol)` and freshness field `updated_at`.

The workstation currently uses:

- `GET /api/gas-daily-prices` for the cash, BalMo, and active monthly matrix.
- `GET /api/gas-daily-prices/monthly-settles` for the Gas Pricing Monthly
  Settles tab.
- `GET /api/gas-curve-evolution` for the ICE Gas Analytics curve
  evolution page.
- `GET /api/gas-daily-prices/contract` for cell-level history drilldowns.

The ICE Gas Cash & Term routes do not read calendar tables, legacy `ice_python_v1_*`
schemas, Azure SQL, Criterion Snowflake, or weather-adjusted WDD sources. Active
monthly/front values are selected from available settlement rows in
`ice_python.settlements`; settlement rows are treated as the settlement/expiry
reference until a promoted `helios_prod` calendar contract is introduced. The
Matrix tab defaults Cash and BalMo to `vwap_close`; each column can switch to
`settlement`, `open`, `high`, `low`, `close`, or `vwap_close` independently.
Monthly Settles tab is market-first: Futures and Cash render side by side, with
BalMo underneath. Futures, Cash, and BalMo all use month x year cells. Cash and
BalMo cells display the monthly average of the selected daily price field, and
cell drilldowns are filtered to the daily rows inside that month/year. Basis
outrights are derived as Henry Hub fixed futures plus the market basis leg when
both legs share a trade date.
The market region metadata comes from `backend.scrapes.ice_python.symbols.gas` and
uses EIA storage-region keys: `east`, `midwest`, `mountain`, `pacific`, and
`south_central`. The view does not create a database model, frontend cache
table, backend job, or new credential requirement.

## ICE Gas Analytics Source Contract

The ICE Gas Analytics page reads monthly ICE gas futures settlement marks with
`helios_readonly` from `helios_prod.ice_python.settlements`. It appears in the
`Pricing` sidebar section at `/?section=gas-outright` directly below ICE Gas
Cash & Term and is production-visible on Vercel.

The page has two tabs:

- `Outright`: one EIA region, one gas market, and one monthly `gasStrip`.
- `Calendar Spread`: one EIA region, one gas market, and `gasNear - gasFar`.

The route `GET /api/gas-curve-evolution` accepts bounded params
`view=gas-outright|cal-spread`, `market`, `gasStrip`, `gasNear`, `gasFar`,
`startYear`, and `endYear`. `sparkStrip` is accepted only as a fallback for
reference links when `gasStrip` is missing. The default page state is South
Central, Henry Hub, Outright, and the current/front monthly strip. The
default year window is current year minus four through current year plus two.

Fixed-price markets use the market futures product directly, such as
`HNG H27-IUS`. Basis markets compute all-in outright values as Henry Hub fixed
futures plus the market basis futures on the same `trade_date`. Calendar Spread
uses near all-in outright minus far all-in outright; basis markets therefore
compute `(Henry near + basis near) - (Henry far + basis far)`. The chart x-axis
uses the observed final settlement date for expired contracts when available;
otherwise it uses a gas monthly proxy of the third business day before the
delivery month starts. It does not read an exchange-calendar table. Freshness comes from
`ice_python.settlements.updated_at` and latest matched `trade_date`. The page
does not create a database model, frontend cache table, backend job, or new
credential requirement.

## ICE Power Source Contract

The Pricing sidebar exposes production-visible ICE power pages:
`ICE Power Short Term` at `/?section=ice-power-short-term` and
`ICE Power Term` at `/?section=ice-power-term`. The Reports sidebar exposes
`ICE Term Report` at `/?section=ice-term-report`. Legacy
`/?section=ice-power-term-report-dev` links alias to ICE Term Report,
`/?section=ice-settlements` links alias to Short Term, and legacy local/dev
`/?section=ice-pmi-curve` links alias to Term.

The Short Term page reads PJM short-term settlement marks with
`helios_readonly` from PJM LMPs and `ice_python.settlements`, using the
frontend trade-blotter product dictionary for the displayed contract catalog.

Source systems: PJM hourly LMP tables and ICE Python / ICE XL local Windows
settlement tables.

Primary short-term settle grain:
`market_date x cc x hub x contract x settlement_source_key`.

The short-term scope covers `PDP`, `PWA`, `PDA`, `PJL`, `PDO`, and `ODP` with
daily, weekly, and weekend contract codes. The route
`GET /api/ice-trade-blotter/daily-settlements?scope=short_pjm` returns daily
settle rows and metadata. The product dictionary route exposes the rules used
for mapping trade-blotter product codes to settlement sources.

The Term page renders direct scraped monthly futures matrices by market: PJM
`PMI`/`OPJ`, ERCOT `ERN`/`ECI`, ISO-NE `NEP`, CAISO `SPM`/`NPM`, and Mid-C
`MDC`. It reuses `GET /api/ice-pmi-curve?mode=power&powerProduct=<ICE root>`
with the existing PMI default product. Legacy `sparkProduct` aliases remain
accepted for existing links. Matrix cells reuse
`GET /api/ice-pmi-curve/contract?symbol=<ICE symbol>` for contract-detail
charts. MISO, SPP, and NYISO are not shown until matching direct monthly
futures are present in the active symbol registries.

The ICE Term Report is a Reports-visible report page with canonical
`ice-term-report` route id. It exposes Power and Gas tabs; direct links can use
`/?section=ice-term-report&tab=gas` for the Gas tab. Legacy
`/?section=ice-power-term-report-dev` links remain accepted.
Power reads the same `ice_python.settlements` source through
`GET /api/ice-pmi-curve?mode=power&powerProduct=<ICE root>` and renders PMI/OPJ
and other active ICE power roots as separate product tables. Gas reads active
monthly futures roots from `frontend/lib/gasPricing/ice_gas_registry.json`
through `GET /api/ice-pmi-curve?mode=gas&gasProduct=<ICE root>`. Fixed-price
gas markets use their root directly, and basis markets render all-in monthly
prices as `HNG + <basis root>` to match the Gas Cash & Term convention.

The copied trade-level matching routes still expect the legacy
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

## Local DEV EIA Generation Source Contract

The EIA Generation DEV view (`/?view=eia-generation`) reads daily EIA-930 fuel
mix rows from `eia.eia_930_daily_generation_by_fuel`, daily demand/net
generation rows from `eia.eia_930_daily_region_data`, and observed WSI electric
degree-day buckets from `weather.wsi_daily_weighted_degree_day_observations`.
All frontend reads use `helios_readonly`. It is hidden from Vercel navigation
and `GET /api/eia-generation` returns `404` outside local Next.js runs.

Source systems: EIA Open Data API v2, Hourly Electric Grid Monitor daily fuel
type and daily region-data datasets; WSI Trader historical weighted degree-day
observations.

Promoted raw table grain:
`period x respondent x fueltype x timezone` for fuel rows and
`period x respondent x type x timezone` for daily region rows. The dashboard
presents one row per `period x respondent` by selecting a preferred timezone
variant per region before aggregation. Region buttons map to EIA respondents as:
`US48 -> US48`, `PJM -> PJM`, `MISO -> MISO`, `ERCOT -> ERCO`,
`CAISO -> CISO`, `ISONE -> ISNE`, `NYISO -> NYIS`, `SWPP -> SWPP`,
`TVA -> TVA`, and `SOCO -> SOCO`.

The route accepts bounded params
`region=US48|PJM|MISO|ERCOT|CAISO|ISONE|NYISO|SWPP|TVA|SOCO`, optional
`season=summer|winter`, optional `date=YYYY-MM-DD`, and `refresh=1`. It
converts source daily `megawatthours` values to daily average MW by dividing
by 24, then returns the Home tab KPI fuel shares, last-15-day current/prior
tables, full prior-year and current-year-to-date daily rows for YoY fuel
charts, source freshness, and the selected timezone. Thermal share is defined
as gas plus coal. Demand and net generation come from EIA-930 daily region
`D` and `NG` rows. Weather response and weather-adjusted demand anomaly read
WSI `electric_cdd` for summer and `electric_hdd` for winter, rendered in the
dashboard as Gas CDD/Gas HDD and mapped through each region's explicit WSI
broad entity (`US48 -> CONUS`,
PJM/ISONE/NYISO/TVA/SOCO -> EAST, MISO -> MIDWEST,
ERCOT/SWPP -> SOUTHCENTRAL, CAISO -> PACIFIC). Only the requested season
returns weather chart rows; the opposite season is returned as a lightweight
pending payload until the client requests it.

The local view keeps `region`, `season`, `date`, and `tab` in the URL. The
Home tab renders KPI cards, recent current/prior tables, YoY fuel charts, and
weather response panels. Monthly Averages, Regional Modeling, and YoY + MTD
tabs are read-only aggregations over the same route payload.

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

## WSI Weather Source Contract

The local DEV WSI Weather page (`/?section=wsi-weather`) reads weighted
degree-day forecast rows from
`weather.wsi_daily_weighted_degree_day_forecasts` with `helios_readonly`.
The endpoint is `GET /api/weather/wsi-wdd-forecast-changes`; it is hidden
outside local Next.js runs and returns `404` on Vercel.

Source system: WSI Trader `GetWeightedDegreeDayForecast`.

Promoted table grain:
`source_issue_key x model x forecast_type x request_region x entity_id x forecast_date x metric_name`.

The route accepts bounded params `region`, `metric`, `models`, `cycle`,
`periodMode`, and `refresh=1`. `region` is one of the nine promoted WDD
entities, defaulting to `CONUS`. `metric` is one of the eight promoted WDD
families or derived `tdd`; omitted metrics default to `population_cdd` in
April-October and `gas_hdd` in November-March. `tdd` is derived on read as
`population_cdd + gas_hdd`; no source `tdd` metric row is expected. `models`
defaults to WSI plus `GFS_OP`, `GFS_ENS`, `ECMWF_OP`, `ECMWF_ENS`, `AIFS`,
and `AIFS_ENS`. `cycle` accepts canonical `latest`, `00Z`, or `12Z`; the route
also maps current WSI wording so `first forecast` means `00Z` and
`other forecast` means `12Z`. Explicit cycles use canonicalized
`model_run_cycle` / `source_init_cycle` when populated and fall back only for
older null-metadata issue rows. `periodMode` accepts `dayBuckets` or
`eiaWeeks`.

The response returns selected filter metadata, per-model issue status and
completeness, daily rows, period rows, and normal-source metadata. Forecast is
read from `<metric>`, or summed from `population_cdd` and `gas_hdd` for `tdd`.
Normal values prefer the 10-year normal from
`weather.wsi_daily_weighted_degree_day_10yr_normals`; if that table has not
been applied/backfilled locally, the route computes the same bounded 10-year
normal from `weather.wsi_daily_weighted_degree_day_observations`. The legacy
`<metric>_normal_30yr` and `<metric>_dfn_30yr` fields are visible fallback
sources only. WSI 24-hour change uses `<metric>_difference`; for `tdd`, change
fields are summed across Pop CDD and Gas HDD. Model-run changes use available
`<metric>_6hr_difference` through `<metric>_36hr_difference` fields, with
optional `<metric>_48hr_difference` and
`<metric>_72hr_difference` rows surfaced when present. No frontend route writes
telemetry to `ops.api_fetch_log`.

The local DEV WSI Report page (`/?section=wsi-weather-report`) calls the same
endpoint with `report=1`. The default table payload stays intact, and the
extra `report` object is attached only for report requests. The report renders
one active WDD region at a time through tabs for `CONUS`, `EAST`, `MIDWEST`,
`SOUTHCENTRAL`, `MOUNTAIN`, `PACIFIC`, `GASCONSEAST`, `GASCONSWEST`, and
`GASPRODUCING`. Report requests always use the full promoted model set in
WSI-first order for the model-change matrix, regardless of a `models` query
param. WSI remains the primary forecast model and baseline for EIA week plus
Days 1-5 / 6-10 / 11-15 summary rows. The report-only `modelChanges` rows carry
model status, issue/cycle metadata, 15-day forecast total, vs-WSI forecast, and
12h/24h/48h/72h changes. WSI 24h change uses `<metric>_difference`; WSI
12h/48h/72h changes are only non-null when the source rows include
`<metric>_<hour>hr_difference`. Supporting models use their model-run
`<metric>_<hour>hr_difference` fields. Prior-year actuals are read from
`weather.wsi_daily_weighted_degree_day_observations` by matching each forecast
date to the prior calendar year's month/day, ignoring Feb 29; `tdd` prior-year
actuals and displayed model-change numbers are `population_cdd + gas_hdd`, with
thermal coloring based on `population_cdd` departure/change minus `gas_hdd`
departure/change.

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

## Criterion Noms Source Contract

The Criterion Noms page (`/?section=criterion-noms`) is local-dev only while
the Criterion workflow is staged. It is hidden from Vercel navigation, direct
section routing is disabled on Vercel, and `/api/criterion/noms` plus
`/api/criterion/watchlists/*` return 404 outside local Next.js runs.

Source system: Criterion Snowflake `PRODUCTION.PIPELINES`.

Primary source tables:

- `PIPELINES.METADATA`
- `PIPELINES.NOMINATION_POINTS`

The nominations route selects Criterion metadata rows where
`CATEGORY_SHORT = 'Power'` and the point is a delivery point
(`LOC_QTI_SHORT = 'DPQ'` or `REC_DEL_SIGN = -1`). The default state filter is
the staged PJM-state proxy. Explicit saved watchlist points are canonical and
`filter_config` is only UI/default context.

Saved Criterion watchlists are app-owned data in Azure Postgres under
`helioscta_app`:

- `helioscta_app.criterion_watchlists`
- `helioscta_app.criterion_watchlist_items`

Apply
`dbt/azure_postgres/reference_sql/ddl/frontend/criterion_watchlists/table_criterion_watchlists.sql`
as `helios_admin` before enabling Criterion watchlist writes, then run the
matching `verify_criterion_watchlists.sql`. The parent table stores
`watchlist_type`, currently `pjm_power_plants`; the item table stores
`entity_type`, currently `nomination_point`, plus `source_table`, `source_key`,
typed `tsp_short` / `metadata_id` keys, and JSON display/source snapshots. The
frontend exposes local-only mutation routes under `/api/criterion/watchlists`
using the same writer connection rules as Genscape watchlists:
`HELIOS_POSTGRES_WRITER_URL` or `HELIOS_POSTGRES_WRITER_*`, with
`AZURE_POSTGRES_WRITER_*` as fallback. The writer user must be `helios_admin`
and the database must be `helios_prod`.

`GET /api/criterion/noms` accepts bounded params `date=YYYY-MM-DD`,
`states=<csv>`, `state=<state>`, `watchlistId=<id>`, `includeZero=1`,
`limit=1..1000`, and `refresh=1`. Rows expose `sourceTable`, `tspShort`, and
`metadataId` so UI-selected plant points can be validated against Snowflake
metadata before writing to Postgres.

## Salts Source Contract

The Salts page (`/?section=salts`) is production-visible on Vercel in the Gas
sidebar section. It exposes the promoted Salts Home, Salts Inv, and Salts
Forecast tabs backed by bounded server routes.

The default Salts Home tab (`view=gas-salt-model`) is the promoted weather-adjusted salts view. It
reads the bounded `/api/salts/wx-adj-scrapes` payload and uses the promoted
GenscapeDataFeed salt nomination flow columns for daily, weekly, and monthly
table heatmaps plus the full selected season/month weather-adjusted plot grid.

The Salts Inv tab (`view=gas-salt-plots`) recreates the reference facility seasonality and
injection/withdrawal plot page. It requests `includeInventory=1` and reads the
promoted compiled dbt SQL at
`frontend/sql/salts/marts/marts_v1_salt_inventories.sql` against Azure SQL
`GenscapeDataFeed.natgas` raw tables. The source dbt model is
`dbt/dbt_azure_sql/models/salts/marts/marts_v1_salt_inventories.sql`. The route
normalizes inventory and capacity fields to Bcf, daily flow to MMcf/d, and
season cumulative flow to MMcf before rendering KPI cards, all-facility
seasonal small multiples, focused inventory/flow drilldowns, flow-window small
multiples, and a facility scoreboard for Golden Triangle, Pine Prairie,
Perryville, Southern Pines, and Eminence.

The Salts Home tab reads the promoted compiled dbt SQL at
`frontend/sql/salts/marts/marts_v1_salt_facilities_bcf.sql` against Azure SQL
`GenscapeDataFeed.natgas` raw tables, then joins those salts rows in the route
process by gas day/date to `helios_prod` daily weather rows from
`weather.wsi_daily_weighted_degree_day_observations` plus current-day WSI daily
forecast coalesces from `weather.wsi_daily_weighted_degree_day_forecasts`, and
to promoted long-form `ice_python_next_day_gas` next-day physical gas cash
prices from `ice_python.settlements`, keyed by `gas_day x symbol` for all
active next-day symbols in the ICE gas registry. The source dbt models are
`dbt/dbt_azure_sql/models/salts/marts/marts_v1_salt_facilities_bcf.sql` for
salts and
`dbt/azure_postgres/models/pjm_da_model/ice_python/settlements/ice_python_next_day_gas.sql`
for gas-day cash prices. EIA fields from the legacy dashboard are not part of
this first tab; future tabs should use `helios_prod` contracts for non-salts
data.

The same route also returns month-scoped `gasPromptPlots` for Henry Hub and
St 85 cash-minus-BalMo weather scatters. The Salts Home UI renders these in a
separate `Cash-BalMo vs Weather` card before the salts weather-adjusted plot
card, defaults the card to the current calendar month and matching season, and
allows selected-month inspection with independent season, month,
lookback-year, highlight-day, collapse, loading/error, and legend visibility
state. One selected Cash-BalMo weather metric controls both hub plots; winter
options include South Central Gas HDD, CONUS Gas HDD, South Central TDD, and
CONUS TDD, while summer options include South Central Population CDD, CONUS
Population CDD, South Central TDD, and CONUS TDD. Cash uses the promoted
`ice_python_next_day_gas` gas-day mapping; BalMo uses the verified ICE registry
symbols `HHD B0-IUS` and `TRW B0-IUS` from `ice_python.settlements`, joined to
the same ICE trade date that produced the gas-day cash strip.

Primary grain: one gas day after the route-level date join.

The route accepts bounded params `season=winter|summer`, `month=1..12`
constrained to the selected season, `weatherMetric`, `saltsMetric`,
`lookbackYears=1..7`, `recentDays=1..31`, optional
`tableLookbackMonths=12..84`, legacy optional `modelDaily=1`, optional
`includeInventory=1`, optional `includeGasPrompt=0`, optional
`gasPromptOnly=1`, and optional `saltPlotLookbackDays=365..3650`.
`modelDaily=1`
keeps direct daily-flow checks honest by returning HTTP 422 with
`Salt query returned no rows for the selected window.` when the selected daily
flow window has no joined rows. `includeInventory=1` appends the Salts Inv
inventory payload from the promoted inventory mart. `includeGasPrompt=0` lets
the main Salts Home fetch skip Cash-BalMo query work. When gas-prompt data is
included, route responses include selected-month Cash-BalMo plots only.
`gasPromptOnly=1` returns only those month-scoped `gasPromptPlots` and
gas-prompt summary fields, with salts/table/inventory arrays empty, for the
independent Cash-BalMo card. Winter weather metrics are
`southcentral_gas_hdd`, `conus_gas_hdd`, `southcentral_tdd`, and `conus_tdd`;
summer weather metrics are `southcentral_population_cdd`,
`conus_population_cdd`, `southcentral_tdd`, and `conus_tdd`; salts metrics are
`salts_total`, `salts_tx`, `salts_la`, `salts_ms`, and `salts_al`. Omitted or
invalid `weatherMetric` values default to `conus_gas_hdd` in winter and
`conus_population_cdd` in summer.
The current tab renders 5 salts metrics across selected-month and full-season
plot scopes for the selected weather metric, for 10 plots from one
API/database fetch, plus a separate fixed Henry Hub and St 85 Cash-BalMo card
with one selected-month weather scatter per hub for the selected Cash-BalMo
weather metric. Cash-BalMo does not render a full-season plot scope.
Scatter seasons use the shared standardized seasonal year palette, and the
highlight window marks both the latest selected lookback period and the same
calendar period one year earlier. Highlight markers use the season color and
scale by recency within each highlighted season window, with the most recent
date largest.

The Salts Home tab also uses the same route's bounded 36-month joined row
set for the first table migration pass. The frontend renders one collapsible
`Tables - Genscape Scrapes + Cash Gas` pivot table above the plot grid from
the promoted BCF total/regional/facility-flow columns and the promoted
next-day cash gas symbol rows. Daily BCF flow values display as MMcf/d, weekly
and monthly flow periods sum to MMcf, and gas cash prices display as $/MMBtu
with weekly/monthly periods averaging the gas-day prices. The table has `Daily`,
`Weekly`, and `Monthly` modes: Daily shows the latest 14 gas days, Weekly shows
the latest 6 Friday week-ending periods, and Monthly shows the latest 12
calendar months. A period change toggle controls derived `DoD`, `WoW`, or
`MoM / YoY` rows based on the selected mode, and a gradient toggle controls
row-relative heatmap styling across the visible period columns. The default
`Focused` view shows total and regional rows plus Golden Triangle, Pine
Prairie, Perryville, Southern Pines, Eminence, and all ICE next-day cash gas
price rows from `frontend/lib/gasPricing/ice_gas_registry.json`, which is
generated from `backend/scrapes/ice_python/symbols/gas.py` by
`npm run sync:ice-gas-registry`;
`All Facilities` adds all facility flow columns emitted by the promoted mart.
The salts rows are flow metrics, not true inventory levels. Legacy EIA fields
remain excluded until they have approved `helios_prod` source contracts.

The production routes do not write or cache salts data in Azure Postgres, and
they do not require deployed Azure SQL `salts` views. Vercel executes the
promoted compiled SQL directly against `GenscapeDataFeed.natgas` using the
server-only Azure SQL credentials, then joins to `helios_prod` read-only
weather, EIA, and ICE gas price sources in the route process.

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
GET /api/criterion/noms?date=YYYY-MM-DD&watchlistId=<id>&limit=1..1000
GET /api/criterion/watchlists
POST /api/criterion/watchlists
POST /api/criterion/watchlists/<id>/points
DELETE /api/criterion/watchlists/<id>/points
GET /api/criterion/gtn-pipeline-balance?date=YYYY-MM-DD&refresh=1
```

Because `natgas.nominations` is a large fact table, Genscape fact routes require
`start`, `end`, and at least one metadata filter. Health checks use small
sample windows and `includeCount=false`.

Run the endpoint health check after a local build or production deploy:

```bash
npm run check:api -- --base-url=http://localhost:3000 --cache-bust
npm run check:api -- --base-url=http://localhost:3000 --filter="Power Settles" --cache-bust
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

The Vercel project production branch is `main`. The canonical production URL is
`https://frontend-helioscta.vercel.app`. Every successful production deployment
from GitHub `main` should publish to that URL directly. Do not treat
`frontend-git-main-helioscta.vercel.app`, generated deployment URLs, or manual
`vercel alias set` commands as the production promotion path. Promotion should
come from GitHub pushes or GitHub/Vercel redeploys of the `main` branch.

After a production push, verify the production domain:

```bash
npm run check:vercel-production
```

If the check fails because `https://frontend-helioscta.vercel.app` has not
reached the latest `origin/main` commit, wait for the deployment to finish or
redeploy from GitHub/Vercel. Do not repair the mismatch with a manual alias.

Power Settles Vercel email delivery requires these server-only Vercel
environment variables:

```text
CRON_SECRET=
AZURE_OUTLOOK_CLIENT_ID=
AZURE_OUTLOOK_TENANT_ID=
AZURE_OUTLOOK_CLIENT_SECRET=
AZURE_OUTLOOK_SENDER=aidan.keaveny@helioscta.com
HELIOS_EMAIL_FRONTEND_BASE_URL=https://frontend-helioscta.vercel.app
```

The Power Settles Vercel queue recipient is pinned in code to
`aidan.keaveny@helioscta.com` for the current deployment.
