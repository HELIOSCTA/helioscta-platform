# Weather Backfills

Use this runbook for controlled weather source-table replays. These commands
run on the production VM as the `helios` service user and load
`/etc/helioscta/backend.env` through systemd so credentials are not shell
expanded.

## What Can Be Replayed

- WSI hourly observed weather is a true date-window backfill through WSI Trader
  `GetHistoricalObservations`.
- WSI daily weighted temperature and degree-day observations are true
  date-window backfills through WSI Trader `GetHistoricalObservations`.
- WSI hourly forecasts cannot be historically backfilled with the promoted
  `GetHourlyForecast` endpoint. The scheduled scrape stores source issue
  snapshots going forward.
- WSI daily weighted temperature and degree-day forecasts cannot be
  historically backfilled with the promoted `GetModelForecast` and
  `GetWeightedDegreeDayForecast` endpoints. The scheduled scrape stores source
  issue snapshots going forward.

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

## WSI Daily Weighted Observations

Destination tables:

- `weather.wsi_daily_weighted_temperature_observations`
- `weather.wsi_daily_weighted_degree_day_observations`

Default scope: all historical weighted-temperature regions accepted by WSI for
the current account, and all nine historical weighted degree-day regions
accepted by the endpoint.

Safe rerun key for both tables:
`source_product_id, request_region, entity_id, observation_date, metric_name`.

Default max window: 366 observed dates. For larger replays, run in chunks.

```bash
cat > /tmp/helios-wsi-daily-weighted-observations-backfill.py <<'PY'
from backend.backfills.weather.wsi.daily_weighted_observations import main

print(main(start_date="2026-07-01", end_date="2026-07-07"))
PY

sudo systemd-run --unit=helios-wsi-daily-weighted-observations-backfill --wait --collect --pipe --property=User=helios --property=WorkingDirectory=/opt/helioscta-platform --property=EnvironmentFile=/etc/helioscta/backend.env /opt/helioscta-platform/.venv/bin/python /tmp/helios-wsi-daily-weighted-observations-backfill.py
rm -f /tmp/helios-wsi-daily-weighted-observations-backfill.py
```

## WSI Daily Weighted Forecasts

Destination tables:

- `weather.wsi_daily_weighted_temperature_forecasts`
- `weather.wsi_daily_weighted_degree_day_forecasts`

Default scope: all NA weighted-temperature regions returned by WSI
`allregions=true`, and raw WSI, GFS_OP, GFS_ENS, ECMWF_OP,
ECMWF_ENS, AIFS, and AIFS_ENS weighted degree-day forecasts for all nine
weighted degree-day regions accepted by the forecast endpoint. WSI weighted
degree-day forecasts use the original 32 metrics; model-driven degree-day
forecasts use the 72 metrics returned by WSI, including 6-hour difference
columns. Scheduled model-driven WDD refreshes are owned by per-model/per-cycle
pollers that upsert only complete 00Z/12Z snapshots; the combined manual
orchestration remains useful for latest-issue probes. EIA storage-week totals,
period buckets, and any forecast-change views should be derived from the raw
rows downstream. Ten-year normal calculations are not part of the promoted raw
table contract.

Safe rerun key for both tables:
`source_issue_key, model, forecast_type, request_region, entity_id,
forecast_date, metric_name`.

Hot-table retention keeps 90 days of weighted-temperature source issues and 30
days of weighted degree-day source issues.

There is no historical replay path in v1. After DDL is applied, run the
scheduled orchestration on demand to refresh the latest source issue:

```bash
sudo systemd-run --unit=helios-wsi-daily-weighted-forecasts-manual --wait --collect --pipe --property=User=helios --property=WorkingDirectory=/opt/helioscta-platform --property=EnvironmentFile=/etc/helioscta/backend.env /opt/helioscta-platform/.venv/bin/python -c "from backend.orchestration.weather.wsi import daily_weighted_forecasts; daily_weighted_forecasts.main(degree_day_models=['WSI'], metadata={'run_reason':'manual_latest_baseline'})"
```

For a model-driven WDD on-demand refresh, run the poller for the expected model
and source init cycle. This upserts only after the snapshot is complete:

```bash
sudo systemd-run --unit=helios-wsi-wdd-gfs-op-12z-manual --wait --collect --pipe --property=User=helios --property=WorkingDirectory=/opt/helioscta-platform --property=EnvironmentFile=/etc/helioscta/backend.env /opt/helioscta-platform/.venv/bin/python -c "from backend.orchestration.weather.wsi.daily_weighted_forecasts import run_degree_day_model_run; run_degree_day_model_run(model='GFS_OP', model_run_cycle='12Z', metadata={'run_reason':'manual_model_run_refresh'})"
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
  AND pipeline_name = 'wsi_hourly_observed_temperatures'
ORDER BY created_at DESC
LIMIT 20;
```

```sql
SELECT
    'wsi_daily_weighted_temperature' AS dataset,
    request_region,
    NULL::VARCHAR AS model,
    NULL::BOOLEAN AS bias_corrected,
    NULL::VARCHAR AS model_run_cycle,
    entity_id,
    COUNT(*) AS rows,
    COUNT(DISTINCT source_issue_key) AS source_issue_count,
    MAX(COALESCE(source_issue_at_utc, scrape_run_at_utc))::text AS latest_issue_at,
    NULL::text AS latest_source_init_at_utc,
    MIN(forecast_date)::text AS min_forecast_date,
    MAX(forecast_date)::text AS max_forecast_date,
    COUNT(DISTINCT metric_name) AS metric_count,
    MAX(updated_at)::text AS latest_updated_at
FROM weather.wsi_daily_weighted_temperature_forecasts
GROUP BY request_region, entity_id
UNION ALL
SELECT
    'wsi_daily_weighted_degree_day' AS dataset,
    request_region,
    model,
    bias_corrected,
    model_run_cycle,
    entity_id,
    COUNT(*) AS rows,
    COUNT(DISTINCT source_issue_key) AS source_issue_count,
    MAX(COALESCE(source_issue_at_utc, scrape_run_at_utc))::text AS latest_issue_at,
    MAX(source_init_at_utc)::text AS latest_source_init_at_utc,
    MIN(forecast_date)::text AS min_forecast_date,
    MAX(forecast_date)::text AS max_forecast_date,
    COUNT(DISTINCT metric_name) AS metric_count,
    MAX(updated_at)::text AS latest_updated_at
FROM weather.wsi_daily_weighted_degree_day_forecasts
GROUP BY request_region, model, bias_corrected, model_run_cycle, entity_id
ORDER BY dataset, request_region, model, bias_corrected, model_run_cycle, entity_id;
```

```sql
SELECT
    'wsi_daily_weighted_temperature_observed' AS dataset,
    request_region,
    entity_id,
    COUNT(*) AS rows,
    MIN(observation_date)::text AS min_observation_date,
    MAX(observation_date)::text AS max_observation_date,
    COUNT(DISTINCT metric_name) AS metric_count,
    MAX(updated_at)::text AS latest_updated_at
FROM weather.wsi_daily_weighted_temperature_observations
GROUP BY request_region, entity_id
UNION ALL
SELECT
    'wsi_daily_weighted_degree_day_observed' AS dataset,
    request_region,
    entity_id,
    COUNT(*) AS rows,
    MIN(observation_date)::text AS min_observation_date,
    MAX(observation_date)::text AS max_observation_date,
    COUNT(DISTINCT metric_name) AS metric_count,
    MAX(updated_at)::text AS latest_updated_at
FROM weather.wsi_daily_weighted_degree_day_observations
GROUP BY request_region, entity_id
ORDER BY dataset, request_region, entity_id;
```

```sql
SELECT
    dataset,
    source_system,
    availability_type,
    business_date,
    scope,
    grain,
    completeness_status,
    row_count,
    entity_count,
    period_count,
    payload,
    created_at
FROM ops.data_availability_events
WHERE dataset IN (
    'wsi_daily_weighted_temperature_forecasts',
    'wsi_daily_weighted_degree_day_forecasts',
    'wsi_daily_weighted_temperature_observations',
    'wsi_daily_weighted_degree_day_observations'
)
ORDER BY created_at DESC
LIMIT 20;
```
