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
```

Local development also exposes a clearly separated `DEV` sidebar section:

```text
GET /api/pjm-da-model?date=YYYY-MM-DD&cutoff=YYYY-MM-DDTHH:MM
GET /api/pjm-price-duration-curves?hub=WESTERN%20HUB&month=7&years=2021,2022,2023,2024,2025&hourFilter=weekday_onpeak
GET /api/dev/nav-positions?fund=all&rawLimit=200
GET /api/pjm-generation?date=YYYY-MM-DD
GET /api/weather/hourly-temps?region=PJM&observedLookbackDays=3&forecastRun=primary
GET /api/weather/hourly-forecast?region=PJM&station=PJM&forecastRun=primary
GET /api/pjm-weather?region=PJM&hours=24
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
the selected detail month. `5x16` is business-day HE8-23, `7x16` is all days
HE8-23, `7x8` is all days HE1-7/HE24, `wrap` is 7x8 plus weekend HE8-23, and
`7x24` is all hours. Legacy aliases `onpeak`, `offpeak`, and `flat` map to
`5x16`, `wrap`, and `7x24`. No NERC holiday calendar is applied in this v1
production view. Hub spreads in the UI are derived client-side from two route
payloads as `To Hub - From Hub`.

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
exceedance share, not chronological time. `weekday_onpeak` is Monday-Friday
HE8-23 and does not exclude holidays in v1.

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
the hourly breakdown and scarcity table. No NERC holiday calendar is applied in
this view.

The Historical Settlements page also hosts Term Bible as a second tab. The
embedded Term Bible view reuses `GET /api/pjm-term-bible`, renders tables only,
and suppresses the daily plot. Legacy links with `?section=pjm-term-bible` open
the Historical Settlements page on the Term Bible tab.

## Local DEV Positions Source Contract

The Positions DEV view reads NAV position valuation snapshots with
`helios_readonly` from `nav.positions`. It is local-only and appears in the
local `DEV` sidebar section at `/?section=nav-positions`; Vercel builds hide
the page and return `404` from `GET /api/dev/nav-positions`.

Source system: NAV SFTP Position Valuation Detail Report XLSX files.

Promoted table grain:
`fund_code x nav_date x sftp_upload_timestamp x source_file_name x source_file_row_number`.

The route `GET /api/dev/nav-positions` accepts bounded params:
`date=YYYY-MM-DD`, `fund`, `accountGroup`, `product`, and `rawLimit`.
Without `date`, it selects the latest NAV date and latest upload per fund. The
response returns a product summary aggregated by fund, account group, product,
type, month, client/source symbols, call/put, and strike, plus capped raw rows
for source-column inspection. The page also exposes a local rules tab for the
TypeScript contract/product-code rules and lookup table. It does not mutate
data or create a frontend cache table.

## Local DEV PJM Generation Source Contract

The Generation DEV view reads PJM generation and capacity feeds with
`helios_readonly` from `pjm.gen_by_fuel`, `pjm.day_gen_capacity`, and
`pjm.rt_and_self_ecomax`.

Source system: PJM Data Miner 2 generation feeds.

Promoted table grain:
`pjm.gen_by_fuel` is keyed by `datetime_beginning_utc x fuel_type`.
`pjm.day_gen_capacity` is keyed by `bid_datetime_beginning_utc`.
`pjm.rt_and_self_ecomax` is keyed by `datetime_beginning_utc`.

The route `GET /api/pjm-generation` accepts optional `date=YYYY-MM-DD`.
Without `date`, it selects the latest operating day where all three feeds have
at least 23 hourly timestamps, allowing DST-short days. The response returns
hourly fuel mix, capacity economic max, emergency max, committed capacity,
scheduled-generation economic max fields, fuel summary rows, and source-window
freshness. Historical depth is limited by `pjm.rt_and_self_ecomax` until that
feed is backfilled.

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
not create a dbt model, table, or materialized cache.

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
create a dbt model, table, or materialized cache. The historical scatter
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

## NOAA Weather Source Contract

The NOAA METAR Weather view reads realtime observations from
`weather.noaa_metar_observations` using `helios_readonly`. The source grain is
`station_id x observation_time_utc`.

Required fields:
`station_id`, `station_name`, `region`, `observation_time_utc`, `temp_f`,
`dew_point_f`, `feels_like_f`, `wind_speed_mph`, `wind_gust_mph`,
`wind_dir_degrees`, `pressure_mb`, `visibility_miles`, `raw_metar`, and
`updated_at`.

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

Run the endpoint health check after a local build or production deploy:

```bash
npm run check:api -- --base-url=http://localhost:3000 --cache-bust
npm run check:api -- --base-url=https://frontend-helioscta.vercel.app --cache-bust
```

The checker calls each production API route, parses `Server-Timing`, and fails
when a route is broken or over its route latency budget. For protected Vercel
deployments, set `HELIOS_API_HEALTH_BYPASS_TOKEN`; the checker sends it as the
`x-vercel-protection-bypass` header. Use `--require-timing` for local checks
where `Server-Timing` should be present; production Vercel responses may omit
that header, in which case the checker falls back to total request time.

## Vercel

Configure the Vercel project root as `frontend`. Production access is expected
to be handled by Vercel/SSO/project access, not app-level auth.
