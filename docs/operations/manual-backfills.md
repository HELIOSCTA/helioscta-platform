# Manual Backfills

Use this runbook for controlled PJM source-table replays. Backfills write to
the same canonical production tables as the scheduled jobs and rely on the same
idempotent upsert keys.

## Scope

Covered workflows:

- `backend.backfills.power.pjm.da_hrl_lmps`
- `backend.backfills.power.pjm.rt_hrl_lmps`
- `backend.backfills.power.pjm.rt_unverified_hrl_lmps`
- `backend.backfills.power.pjm.hrl_load_metered`
- `backend.backfills.power.pjm.hrl_load_prelim`
- `backend.backfills.power.pjm.gen_outages_by_type`
- `backend.backfills.weather.wsi.hourly_observed`
- `backend.orchestration.power.pjm.hourly_price_backfill_7_day` for the
  scheduled seven-day LMP price repair wrapper.

Destination tables:

- `pjm.da_hrl_lmps`
- `pjm.rt_hrl_lmps`
- `pjm.rt_fivemin_hrl_lmps`
- `pjm.rt_unverified_hrl_lmps`
- `pjm.hrl_load_metered`
- `pjm.hrl_load_prelim`
- `pjm.gen_outages_by_type`
- `weather.wsi_hourly_observed_temperatures`

Backfill runs add `run_mode=backfill`, `backfill_workflow`,
`backfill_start_date`, and `backfill_end_date` to `ops.api_fetch_log.metadata`
for the API requests they issue. PJM backfill entry points call lower-level
scrape modules; scheduled PJM orchestrators remain responsible for polling and
data-readiness events. WSI hourly observed backfills call the existing WSI
orchestration path and emit the same weather freshness event as scheduled runs.

## Scheduled Price Repair

`helios-pjm-hourly-price-backfill-7-day.timer` runs
`backend.orchestration.power.pjm.hourly_price_backfill_7_day` nightly at
`02:00 America/New_York`. It replays seven market dates per feed:

- DA hourly LMPs through the current PJM market date.
- Verified RT hourly LMPs through two market dates back, because the verified
  source posts later in the day.
- Verified RT five-minute HRL LMPs through two market dates back, using the
  same hub, zone, and interface scope as the dedicated workflow.
- Unverified RT hourly LMPs through the prior market date. The PJM hourly
  bucket is the freshness path; this repair remains the recent-window
  gap-catcher for a short-retention source.

This scheduled repair writes to the same canonical `pjm` tables and uses the
same `ops.api_fetch_log.metadata` backfill fields as manual runs. The verified
RT five-minute repair also emits complete-day readiness events when a repaired
date is complete. It does not replace the one-off manual command pattern below
for older ranges or non-price PJM feeds.

## Safety Rules

- Run from the production VM as the `helios` service user.
- Prefer small windows first.
- Default maximum windows:
  - DA hourly LMPs: `31` days.
  - RT verified hourly LMPs: `31` days.
  - RT unverified hourly LMPs: `30` days.
  - PJM metered hourly load: `31` days.
  - PJM preliminary hourly load: `31` days.
  - Generation outages by type: `31` execution dates.
  - WSI hourly observed weather: `31` local observation dates.
- Future dates are rejected unless `allow_future=True` is passed.
- Do not run a backfill during the matching scheduled timer window unless the
  overlap is intentional.

## VM Command Pattern

Use `systemd-run` instead of sourcing `/etc/helioscta/backend.env` in a shell.
The environment file can contain characters such as `$` that shell expansion
would alter if sourced directly.

Dry-run example:

```bash
cat > /tmp/helios_da_backfill.py <<'PY'
from backend.backfills.power.pjm.da_hrl_lmps import main

print(main(start_date="2026-06-10", end_date="2026-06-10", dry_run=True))
PY

sudo systemd-run --unit=helios-da-hrl-lmps-backfill --wait --collect --pipe --property=User=helios --property=WorkingDirectory=/opt/helioscta-platform --property=EnvironmentFile=/etc/helioscta/backend.env /opt/helioscta-platform/.venv/bin/python /tmp/helios_da_backfill.py
rm -f /tmp/helios_da_backfill.py
```

## DA Hourly LMP Backfill

```bash
cat > /tmp/helios_da_backfill.py <<'PY'
from backend.backfills.power.pjm.da_hrl_lmps import main

print(main(start_date="2026-06-01", end_date="2026-06-07"))
PY

sudo systemd-run --unit=helios-da-hrl-lmps-backfill --wait --collect --pipe --property=User=helios --property=WorkingDirectory=/opt/helioscta-platform --property=EnvironmentFile=/etc/helioscta/backend.env /opt/helioscta-platform/.venv/bin/python /tmp/helios_da_backfill.py
rm -f /tmp/helios_da_backfill.py
```

## RT Verified Hourly LMP Backfill

```bash
cat > /tmp/helios_rt-hrl-backfill.py <<'PY'
from backend.backfills.power.pjm.rt_hrl_lmps import main

print(main(start_date="2026-06-10", end_date="2026-06-10"))
PY

sudo systemd-run --unit=helios-rt-hrl-lmps-backfill --wait --collect --pipe --property=User=helios --property=WorkingDirectory=/opt/helioscta-platform --property=EnvironmentFile=/etc/helioscta/backend.env /opt/helioscta-platform/.venv/bin/python /tmp/helios_rt-hrl-backfill.py
rm -f /tmp/helios_rt-hrl-backfill.py
```

## RT Unverified Hourly LMP Backfill

```bash
cat > /tmp/helios_rt-unverified-hrl-backfill.py <<'PY'
from backend.backfills.power.pjm.rt_unverified_hrl_lmps import main

print(main(start_date="2026-06-10", end_date="2026-06-10"))
PY

sudo systemd-run --unit=helios-rt-unverified-hrl-lmps-backfill --wait --collect --pipe --property=User=helios --property=WorkingDirectory=/opt/helioscta-platform --property=EnvironmentFile=/etc/helioscta/backend.env /opt/helioscta-platform/.venv/bin/python /tmp/helios_rt-unverified-hrl-backfill.py
rm -f /tmp/helios_rt-unverified-hrl-backfill.py
```

## PJM Metered Hourly Load Backfill

This replays PJM Data Miner 2 `hrl_load_metered` by
`datetime_beginning_ept`. It upserts into `pjm.hrl_load_metered` using
`datetime_beginning_utc, nerc_region, mkt_region, zone, load_area, is_verified`.

```bash
cat > /tmp/helios-hrl-load-metered-backfill.py <<'PY'
from backend.backfills.power.pjm.hrl_load_metered import main

print(main(start_date="2026-06-01", end_date="2026-06-07"))
PY

sudo systemd-run --unit=helios-hrl-load-metered-backfill --wait --collect --pipe --property=User=helios --property=WorkingDirectory=/opt/helioscta-platform --property=EnvironmentFile=/etc/helioscta/backend.env /opt/helioscta-platform/.venv/bin/python /tmp/helios-hrl-load-metered-backfill.py
rm -f /tmp/helios-hrl-load-metered-backfill.py
```

## PJM Preliminary Hourly Load Backfill

This replays PJM Data Miner 2 `hrl_load_prelim` by
`datetime_beginning_ept`. It upserts into `pjm.hrl_load_prelim` using
`datetime_beginning_utc, load_area`.

```bash
cat > /tmp/helios-hrl-load-prelim-backfill.py <<'PY'
from backend.backfills.power.pjm.hrl_load_prelim import main

print(main(start_date="2026-06-01", end_date="2026-06-07"))
PY

sudo systemd-run --unit=helios-hrl-load-prelim-backfill --wait --collect --pipe --property=User=helios --property=WorkingDirectory=/opt/helioscta-platform --property=EnvironmentFile=/etc/helioscta/backend.env /opt/helioscta-platform/.venv/bin/python /tmp/helios-hrl-load-prelim-backfill.py
rm -f /tmp/helios-hrl-load-prelim-backfill.py
```

## WSI Hourly Observed Weather Backfill

This replays WSI Trader `GetHistoricalObservations` for the configured PJM
station basket, including the `station_id = 'PJM'` aggregate used by the initial
PJM load-growth join. It upserts into
`weather.wsi_hourly_observed_temperatures` using
`station_id, observation_time_local, region`.

```bash
cat > /tmp/helios-wsi-hourly-observed-backfill.py <<'PY'
from backend.backfills.weather.wsi.hourly_observed import main

print(main(start_date="2026-06-16", end_date="2026-06-17"))
PY

sudo systemd-run --unit=helios-wsi-hourly-observed-backfill --wait --collect --pipe --property=User=helios --property=WorkingDirectory=/opt/helioscta-platform --property=EnvironmentFile=/etc/helioscta/backend.env /opt/helioscta-platform/.venv/bin/python /tmp/helios-wsi-hourly-observed-backfill.py
rm -f /tmp/helios-wsi-hourly-observed-backfill.py
```

## Generation Outages By Type Backfill

This replays PJM Data Miner 2 `gen_outages_by_type` by
`forecast_execution_date_ept`. Each execution date returns the seven-day outage
forecast by region and upserts into `pjm.gen_outages_by_type` using
`forecast_execution_date_ept, forecast_date, region`.

```bash
cat > /tmp/helios-gen-outages-by-type-backfill.py <<'PY'
from backend.backfills.power.pjm.gen_outages_by_type import main

print(main(start_date="2026-06-01", end_date="2026-06-07"))
PY

sudo systemd-run --unit=helios-gen-outages-by-type-backfill --wait --collect --pipe --property=User=helios --property=WorkingDirectory=/opt/helioscta-platform --property=EnvironmentFile=/etc/helioscta/backend.env /opt/helioscta-platform/.venv/bin/python /tmp/helios-gen-outages-by-type-backfill.py
rm -f /tmp/helios-gen-outages-by-type-backfill.py
```

## Verification

Check API telemetry for backfill context:

```sql
SELECT
    pipeline_name,
    status,
    http_status,
    rows_returned,
    metadata,
    created_at
FROM ops.api_fetch_log
WHERE metadata->>'run_mode' = 'backfill'
ORDER BY created_at DESC
LIMIT 20;
```

Check hourly LMP source coverage:

```sql
SELECT
    'da_hourly' AS feed,
    datetime_beginning_ept::date AS market_date,
    COUNT(*) AS rows,
    COUNT(DISTINCT pnode_name) AS nodes,
    MIN(datetime_beginning_ept) AS min_ts,
    MAX(datetime_beginning_ept) AS max_ts
FROM pjm.da_hrl_lmps
GROUP BY datetime_beginning_ept::date
UNION ALL
SELECT
    'rt_verified_hourly' AS feed,
    datetime_beginning_ept::date AS market_date,
    COUNT(*) AS rows,
    COUNT(DISTINCT pnode_name) AS nodes,
    MIN(datetime_beginning_ept) AS min_ts,
    MAX(datetime_beginning_ept) AS max_ts
FROM pjm.rt_hrl_lmps
GROUP BY datetime_beginning_ept::date
UNION ALL
SELECT
    'rt_unverified_hourly' AS feed,
    datetime_beginning_ept::date AS market_date,
    COUNT(*) AS rows,
    COUNT(DISTINCT pnode_name) AS nodes,
    MIN(datetime_beginning_ept) AS min_ts,
    MAX(datetime_beginning_ept) AS max_ts
FROM pjm.rt_unverified_hrl_lmps
GROUP BY datetime_beginning_ept::date
UNION ALL
SELECT
    'rt_verified_fivemin' AS feed,
    datetime_beginning_ept::date AS market_date,
    COUNT(*) AS rows,
    COUNT(DISTINCT pnode_name) AS nodes,
    MIN(datetime_beginning_ept) AS min_ts,
    MAX(datetime_beginning_ept) AS max_ts
FROM pjm.rt_fivemin_hrl_lmps
WHERE row_is_current = true
GROUP BY datetime_beginning_ept::date
ORDER BY market_date DESC, feed
LIMIT 30;
```

Check generation outage coverage:

```sql
SELECT
    forecast_execution_date_ept,
    COUNT(*) AS rows,
    COUNT(DISTINCT forecast_date) AS forecast_dates,
    COUNT(DISTINCT region) AS regions,
    MIN(forecast_date) AS min_forecast_date,
    MAX(forecast_date) AS max_forecast_date
FROM pjm.gen_outages_by_type
GROUP BY forecast_execution_date_ept
ORDER BY forecast_execution_date_ept DESC
LIMIT 30;
```

Check PJM hourly load coverage:

```sql
SELECT
    'metered' AS feed,
    datetime_beginning_ept::date AS market_date,
    COUNT(*) AS rows,
    COUNT(DISTINCT load_area) AS load_areas,
    MIN(datetime_beginning_ept) AS min_ts,
    MAX(datetime_beginning_ept) AS max_ts
FROM pjm.hrl_load_metered
GROUP BY datetime_beginning_ept::date
UNION ALL
SELECT
    'prelim' AS feed,
    datetime_beginning_ept::date AS market_date,
    COUNT(*) AS rows,
    COUNT(DISTINCT load_area) AS load_areas,
    MIN(datetime_beginning_ept) AS min_ts,
    MAX(datetime_beginning_ept) AS max_ts
FROM pjm.hrl_load_prelim
GROUP BY datetime_beginning_ept::date
ORDER BY market_date DESC, feed
LIMIT 30;
```

Check WSI hourly observed coverage for the initial PJM load-growth weather
join:

```sql
SELECT
    observation_time_local::date AS observation_date,
    COUNT(*) AS rows,
    COUNT(DISTINCT station_id) AS stations,
    MIN(observation_time_local) AS min_ts,
    MAX(observation_time_local) AS max_ts
FROM weather.wsi_hourly_observed_temperatures
WHERE
    region = 'PJM'
    AND station_id = 'PJM'
GROUP BY observation_time_local::date
ORDER BY observation_date DESC
LIMIT 30;
```

Check the preliminary-load to WSI local-hour join expected by the first
load-growth frontend:

```sql
SELECT
    p.datetime_beginning_ept::date AS market_date,
    COUNT(*) AS prelim_rows,
    COUNT(w.observation_time_local) AS rows_with_wsi_pjm,
    COUNT(*) - COUNT(w.observation_time_local) AS missing_wsi_pjm_rows,
    MIN(p.datetime_beginning_ept) AS min_ts,
    MAX(p.datetime_beginning_ept) AS max_ts
FROM pjm.hrl_load_prelim p
LEFT JOIN weather.wsi_hourly_observed_temperatures w
    ON p.datetime_beginning_ept = w.observation_time_local
    AND w.region = 'PJM'
    AND w.station_id = 'PJM'
GROUP BY p.datetime_beginning_ept::date
ORDER BY market_date DESC
LIMIT 30;
```
