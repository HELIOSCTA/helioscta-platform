# Like-Day KNN Sunny

Backend-owned direct-read PJM RTO hourly like-day KNN Sunny model family. The
model reads `helios_prod` through read-only SQL inputs, returns forecast frames,
and does not publish, schedule, write to Postgres, or create database objects.

## Source Contract

Runtime Python reads committed SQL artifacts from:

```text
backend/modelling/pjm_da_models/sql_inputs/
```

Those SQL artifacts are generated from source-owned dbt folders:

- `dbt/azure_postgres/models/pjm_da_model/pjm/da_lmps_hourly`
- `dbt/azure_postgres/models/pjm_da_model/pjm/rto_load_hourly`
- `dbt/azure_postgres/models/pjm_da_model/pjm/load_forecast_hourly`
- `dbt/azure_postgres/models/pjm_da_model/pjm/gen_by_fuel`
- `dbt/azure_postgres/models/pjm_da_model/pjm/gen_outages`
- `dbt/azure_postgres/models/pjm_da_model/ice_python/settlements`
- `dbt/azure_postgres/models/pjm_da_model/meteologica/pjm_forecast_hourly`
- `dbt/azure_postgres/models/pjm_da_model/weather/wsi_hourly_temperature`

Feature grain is `date x hour_ending`. The historical pool adds the `lmp` label
from `pjm.da_hrl_lmps`.

Core feature columns:

```text
date, hour_ending, load_mw_at_hour, solar_at_hour, wind_at_hour,
net_load_at_hour, temp_at_hour, load_ramp_1h_at_hour,
load_ramp_3h_at_hour, outage_total_mw, gas_m3_daily_avg,
day_of_week_number, is_nerc_holiday, is_weekend, dow_sin, dow_cos, lmp
```

`gas_m3_daily_avg` comes from ICE Python next-day gas settlement marks in
`ice_python.settlements`, expanded to gas days with the simple next-day/weekend
rule. `is_nerc_holiday` defaults to 0 because the old calendar is intentionally
not migrated.

## SQL Promotion

Refresh committed backend SQL from `dbt/azure_postgres`:

```powershell
dbt compile --profiles-dir . --select +path:models/pjm_da_model --vars "{pjm_da_model_param_mode: runtime}"
python scripts/promote_pjm_da_model_backend_sql.py
```

Each generated SQL file has a header naming the dbt model, compiled SQL path,
and promotion script. Do not edit files under `sql_inputs/` by hand.

## Commands

```powershell
python -m backend.modelling.pjm_da_models.like_day_model_knn_sunny
python -m backend.modelling.pjm_da_models.like_day_model_knn_sunny.meteo_rto_hourly.pipelines.forecast_tomorrow
python -m backend.modelling.pjm_da_models.like_day_model_knn_sunny.meteo_rto_hourly.pipelines.forecast_next_3_days
python -m backend.modelling.pjm_da_models.like_day_model_knn_sunny.meteo_rto_hourly.pipelines.forecast_full_prediction_window
python -m backend.modelling.pjm_da_models.like_day_model_knn_sunny.pjm_rto_hourly.pipelines.forecast_single_day
```

Plain script execution is also supported for the pipeline entrypoints. Each
entrypoint locates the repo root by finding `backend/modelling/pjm_da_models`
and then imports through the `backend.modelling.pjm_da_models...` package path.

The pipeline entrypoints accept optional old-repo parity knobs:
`pool_start_date`, `pool_year_months`, and
`feature_group_weights_override`. Defaults stay simple and use the rolling
`history_days` window without a hand-picked pool universe.

## Model Notes

The first backend pass keeps the legacy Sunny model's scalar per-hour matching
pattern: for each target HE, compare only historical rows with the same HE, use
a circular day-of-year window, z-score feature groups on the candidate pool,
use NaN-aware Euclidean distance, apply a linear age penalty, and weight analogs
by inverse squared distance.

Historical pool features come from PJM actual load with lead-1 load forecast
fallback, PJM forecast-first renewables with Meteologica forecast and actual
generation fallback, observed-first WSI temperature with forecast fallback,
lead-1 PJM outage forecasts, ICE Python next-day gas settlement marks, and DA
LMP labels. Meteologica forward query features come from Meteologica RTO
load/solar/wind forecast and WSI forecast temperature issues available by the
10:00 EPT run-date cutoff. PJM forward query features come from PJM load and
renewable forecasts available by the same cutoff, with Meteologica renewable
fallback.
