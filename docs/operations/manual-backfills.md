# Manual Backfills

Use this runbook for controlled source-table replays. Backfills write to the
same canonical production tables as the scheduled jobs and rely on the same
idempotent upsert keys.

## Scope

Covered workflows:

- `backend.backfills.power.pjm.da_hrl_lmps`
- `backend.backfills.power.pjm.rt_hrl_lmps`
- `backend.backfills.power.pjm.rt_unverified_hrl_lmps`
- `backend.backfills.power.caiso.da_lmps`
- `backend.backfills.power.caiso.rt_lmps`
- `backend.backfills.power.caiso.historical_lmps`
- `backend.backfills.power.lmp_price_backfill_7_day`
- `backend.backfills.power.pjm.hrl_load_metered`
- `backend.backfills.power.pjm.hrl_load_prelim`
- `backend.backfills.power.pjm.gen_outages_by_type`
- `backend.backfills.weather.wsi.hourly_observed`
- `backend.backfills.power.lmp_price_backfill_7_day` for the scheduled
  seven-day LMP price repair wrapper.

Destination tables:

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
- `pjm.hrl_load_metered`
- `pjm.hrl_load_prelim`
- `pjm.gen_outages_by_type`
- `weather.wsi_hourly_observed_temperatures`

Backfill runs add `run_mode=backfill`, `backfill_workflow`,
`backfill_start_date`, and `backfill_end_date` to `ops.api_fetch_log.metadata`
for the API requests they issue. PJM backfill entry points call lower-level
scrape modules; scheduled PJM orchestrators remain responsible for polling and
data-readiness events. CAISO dedicated backfills call the existing CAISO
orchestration paths and emit complete-day readiness events while suppressing
scheduled-only release emails. WSI hourly observed backfills call the existing
WSI orchestration path and emit the same weather freshness event as scheduled
runs.

CAISO historical LMP backfills use
`backend.backfills.power.caiso.historical_lmps`. This path calls raw CAISO
bulk search and requester-pays S3 download helpers instead of orchestration, so
it does not emit historical data-readiness events or release emails. It stamps
telemetry with
`backfill_family=caiso_lmp_historical_backfill`, separate from the scheduled
seven-day repair's `repair_family=lmp_price_backfill_7_day`.

## Scheduled Price Repair

`helios-lmp-price-backfill-7-day.timer` runs
`backend.backfills.power.lmp_price_backfill_7_day` nightly at `22:15 UTC`. It
replays seven market dates per promoted LMP feed:

- PJM DA hourly LMPs through the current Eastern market date.
- PJM verified RT hourly LMPs through two market dates back.
- PJM verified RT five-minute HRL LMPs through two market dates back.
- PJM unverified RT hourly LMPs through the prior market date.
- ISO-NE DA hourly LMPs through the current Eastern market date.
- ISO-NE final RT hourly LMPs through two market dates back.
- ISO-NE preliminary RT hourly LMPs through the prior market date.
- ERCOT DAM settlement point prices through the current Eastern market date.
- ERCOT RT settlement point prices through the prior market date.
- ERCOT RT price adders by SCED interval through the prior market date.
- ERCOT RT price adders by 15-minute settlement interval through the prior
  market date.
- CAISO DA hourly LMPs through the current OASIS trading date.
- CAISO RT five-minute LMPs through the prior OASIS trading date.

This scheduled repair writes to the same canonical tables and uses
`ops.api_fetch_log.metadata` backfill fields. It intentionally leaves
data-readiness and release-notification side effects owned by the normal
scheduled jobs. It does not replace one-off manual commands for older ranges
or non-price feeds.

## Safety Rules

- Run from the production VM as the `helios` service user.
- Prefer small windows first.
- Default maximum windows:
  - DA hourly LMPs: `31` days.
  - RT verified hourly LMPs: `31` days.
  - RT unverified hourly LMPs: `30` days.
  - CAISO DA hourly LMPs: `31` days.
  - CAISO RT five-minute LMPs: `31` days.
  - CAISO historical LMP loader: chunked into `31` days per OASIS request
    window by default.
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

sudo systemd-run --unit=helios-pjm-da-hrl-lmps-backfill --wait --collect --pipe --property=User=helios --property=WorkingDirectory=/opt/helioscta-platform --property=EnvironmentFile=/etc/helioscta/backend.env /opt/helioscta-platform/.venv/bin/python /tmp/helios_da_backfill.py
rm -f /tmp/helios_da_backfill.py
```

## DA Hourly LMP Backfill

```bash
cat > /tmp/helios_da_backfill.py <<'PY'
from backend.backfills.power.pjm.da_hrl_lmps import main

print(main(start_date="2026-06-01", end_date="2026-06-07"))
PY

sudo systemd-run --unit=helios-pjm-da-hrl-lmps-backfill --wait --collect --pipe --property=User=helios --property=WorkingDirectory=/opt/helioscta-platform --property=EnvironmentFile=/etc/helioscta/backend.env /opt/helioscta-platform/.venv/bin/python /tmp/helios_da_backfill.py
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

## CAISO Historical LMP Backfill

Historical CAISO data older than the recent `SingleZip` retention window comes
from CAISO's requester-pays S3 bucket
`caiso-oasis-s3-prod-groupzips`. Before real writes, install standard AWS
credentials in `/etc/helioscta/backend.env`:

```text
AWS_ACCESS_KEY_ID=<requester-pays-enabled access key>
AWS_SECRET_ACCESS_KEY=<secret>
AWS_DEFAULT_REGION=us-west-1
# Optional when CAISO's bulk endpoint TLS chain is incomplete on the VM:
CAISO_BULK_CA_BUNDLE=/etc/ssl/certs/ca-certificates.crt
```

Use `AWS_SESSION_TOKEN=<token>` as well when using temporary credentials. Do
not commit these values. The AWS account that owns the key is charged for
requester-pays transfer and request costs.

If Python or `curl` fails TLS verification against
`https://oasis-bulk.caiso.com/prod/search`, install the missing CAISO
intermediate into the VM trust store and point the loader at the system bundle:

```bash
curl -fsSL http://crt.sectigo.com/SectigoPublicServerAuthenticationCAEVR36.crt -o /tmp/sectigo-ev-r36.der
sudo openssl x509 -inform DER -in /tmp/sectigo-ev-r36.der -out /usr/local/share/ca-certificates/sectigo-public-server-authentication-ca-ev-r36.crt
sudo update-ca-certificates
```

After editing the env file, verify only the names are present:

```bash
sudo grep -E '^(AWS_(ACCESS_KEY_ID|SECRET_ACCESS_KEY|SESSION_TOKEN|DEFAULT_REGION|REGION)|CAISO_BULK_CA_BUNDLE|REQUESTS_CA_BUNDLE)=' /etc/helioscta/backend.env | cut -d= -f1
```

The historical loader defaults to `dry_run=True`; pass `dry_run=False` only
after a small smoke window succeeds.

```bash
cat > /tmp/helios-caiso-historical-lmps-backfill.py <<'PY'
from backend.backfills.power.caiso.historical_lmps import main

print(
    main(
        start_date="2020-01-01",
        da_end_date="2026-07-17",
        rt_end_date="2026-07-16",
        dry_run=True,
    )
)
PY

sudo systemd-run --unit=helios-caiso-historical-lmps-backfill --wait --collect --pipe --property=User=helios --property=WorkingDirectory=/opt/helioscta-platform --property=EnvironmentFile=/etc/helioscta/backend.env /opt/helioscta-platform/.venv/bin/python /tmp/helios-caiso-historical-lmps-backfill.py
rm -f /tmp/helios-caiso-historical-lmps-backfill.py
```

Smoke one week before the full historical load:

```bash
cat > /tmp/helios-caiso-historical-lmps-backfill.py <<'PY'
from backend.backfills.power.caiso.historical_lmps import main

print(
    main(
        start_date="2020-01-01",
        da_end_date="2020-01-07",
        rt_end_date="2020-01-07",
        dry_run=False,
        request_delay_seconds=8.0,
    )
)
PY

sudo systemd-run --unit=helios-caiso-historical-lmps-backfill-smoke --wait --collect --pipe --property=User=helios --property=WorkingDirectory=/opt/helioscta-platform --property=EnvironmentFile=/etc/helioscta/backend.env /opt/helioscta-platform/.venv/bin/python /tmp/helios-caiso-historical-lmps-backfill.py
rm -f /tmp/helios-caiso-historical-lmps-backfill.py
```

Run the full 2020-to-present replay in a long systemd unit only after the
smoke succeeds. DA bulk history is one group ZIP per operating date; RT bulk
history is 24 hourly group ZIPs per operating date. The default eight-second
inter-day delay means DA plus RT from 2020 can take many hours, and S3 transfer
volume is materially larger than the recent NP15/SP15 `SingleZip` pulls.

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

Check CAISO historical telemetry:

```sql
SELECT
    target_table,
    operation_name,
    status,
    http_status,
    rows_returned,
    metadata->>'backfill_workflow' AS workflow,
    metadata->>'backfill_business_date' AS business_date,
    metadata->>'bulk_key' AS bulk_key,
    created_at
FROM ops.api_fetch_log
WHERE provider = 'caiso'
  AND metadata->>'backfill_family' = 'caiso_lmp_historical_backfill'
ORDER BY created_at DESC
LIMIT 30;
```

Check CAISO LMP coverage:

```sql
SELECT
    'caiso_da_lmps' AS feed,
    operating_date,
    COUNT(*) AS rows,
    COUNT(DISTINCT node_id) AS nodes,
    MIN(interval_start_time_utc) AS min_interval_utc,
    MAX(interval_start_time_utc) AS max_interval_utc
FROM caiso.da_lmps
GROUP BY operating_date
UNION ALL
SELECT
    'caiso_rt_lmps' AS feed,
    operating_date,
    COUNT(*) AS rows,
    COUNT(DISTINCT node_id) AS nodes,
    MIN(interval_start_time_utc) AS min_interval_utc,
    MAX(interval_start_time_utc) AS max_interval_utc
FROM caiso.rt_lmps
GROUP BY operating_date
ORDER BY operating_date DESC, feed
LIMIT 60;
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
