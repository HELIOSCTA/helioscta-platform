# Weather Backfills

Use this runbook for controlled weather source-table replays. These commands
run on the production VM as the `helios` service user and load
`/etc/helioscta/backend.env` through systemd so credentials are not shell
expanded.

## What Can Be Replayed

- WSI hourly observed weather is a true date-window backfill through WSI Trader
  `GetHistoricalObservations`.
- NOAA METAR observations are a rolling-hours replay through AviationWeather
  `api/data/metar`; the promoted scrape currently caps this at 360 hours.
- WSI hourly forecasts cannot be historically backfilled with the promoted
  `GetHourlyForecast` endpoint. The scheduled scrape stores source issue
  snapshots going forward.

## WSI Hourly Observed

Destination table: `weather.wsi_hourly_observed_temperatures`.

Safe rerun key: `station_id, observation_time_local, region`.

Default max window: 31 local observation dates.

```bash
cat > /tmp/helios-wsi-hourly-observed-backfill.py <<'PY'
from backend.backfills.weather.wsi.hourly_observed import main

print(main(start_date="2026-06-01", end_date="2026-06-07"))
PY

sudo systemd-run --unit=helios-wsi-hourly-observed-backfill --wait --collect --pipe --property=User=helios --property=WorkingDirectory=/opt/helioscta-platform --property=EnvironmentFile=/etc/helioscta/backend.env /opt/helioscta-platform/.venv/bin/python /tmp/helios-wsi-hourly-observed-backfill.py
rm -f /tmp/helios-wsi-hourly-observed-backfill.py
```

## NOAA METAR Rolling Lookback

Destination table: `weather.noaa_metar_observations`.

Safe rerun key: `station_id, observation_time_utc`.

Default and max lookback: 360 hours.

```bash
cat > /tmp/helios-noaa-metar-backfill.py <<'PY'
from backend.backfills.weather.noaa.metar_observations import main

print(main(hours=360))
PY

sudo systemd-run --unit=helios-noaa-metar-backfill --wait --collect --pipe --property=User=helios --property=WorkingDirectory=/opt/helioscta-platform --property=EnvironmentFile=/etc/helioscta/backend.env /opt/helioscta-platform/.venv/bin/python /tmp/helios-noaa-metar-backfill.py
rm -f /tmp/helios-noaa-metar-backfill.py
```

## Verification

```sql
SELECT
    'wsi_observed' AS dataset,
    region,
    COUNT(*) AS rows,
    COUNT(DISTINCT station_id) AS stations,
    MIN(observation_time_local)::text AS min_time,
    MAX(observation_time_local)::text AS max_time,
    MAX(updated_at)::text AS latest_updated_at
FROM weather.wsi_hourly_observed_temperatures
GROUP BY region
UNION ALL
SELECT
    'noaa_metar' AS dataset,
    region,
    COUNT(*) AS rows,
    COUNT(DISTINCT station_id) AS stations,
    MIN(observation_time_utc)::text AS min_time,
    MAX(observation_time_utc)::text AS max_time,
    MAX(updated_at)::text AS latest_updated_at
FROM weather.noaa_metar_observations
GROUP BY region
ORDER BY dataset, region;
```

```sql
SELECT
    pipeline_name,
    status,
    http_status,
    target_table,
    metadata,
    created_at
FROM ops.api_fetch_log
WHERE metadata->>'run_mode' = 'backfill'
  AND pipeline_name IN (
      'wsi_hourly_observed_temperatures',
      'noaa_metar_observations'
  )
ORDER BY created_at DESC
LIMIT 20;
```
