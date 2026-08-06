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
python -m backend.modelling.pjm_da_models.pipelines.tomorrow.like_day_knn_sunny_meteo_rto_hourly
python -m backend.modelling.pjm_da_models.pipelines.tomorrow.like_day_knn_sunny_pjm_rto_hourly
python -m backend.modelling.pjm_da_models.pipelines.next_3_days.like_day_knn_sunny_meteo_rto_hourly
python -m backend.modelling.pjm_da_models.pipelines.next_14_days.like_day_knn_sunny_meteo_rto_hourly
```

Family/input-owned modules remain valid:

```powershell
python -m backend.modelling.pjm_da_models.like_day_model_knn_sunny.meteo_rto_hourly.pipelines.forecast_tomorrow
python -m backend.modelling.pjm_da_models.like_day_model_knn_sunny.meteo_rto_hourly.pipelines.forecast_next_3_days
python -m backend.modelling.pjm_da_models.like_day_model_knn_sunny.meteo_rto_hourly.pipelines.forecast_full_prediction_window
python -m backend.modelling.pjm_da_models.like_day_model_knn_sunny.pjm_rto_hourly.pipelines.forecast_tomorrow
```

Plain script execution is also supported for canonical and compatibility
pipeline entrypoints. Each entrypoint locates the repo root by finding
`backend/modelling/pjm_da_models` and then imports through the
`backend.modelling.pjm_da_models...` package path.
The old PJM-backed `forecast_single_day` module remains as a compatibility
wrapper, but new code should use `forecast_tomorrow` to match the other
default one-day model runners.

The input-family `pipelines/` folders support the root horizon scripts.
Meteologica-backed `_shared.py` owns the multi-day orchestration helper, and
the nested `forecast_tomorrow.py` / `forecast_next_3_days.py` modules are
old-path compatibility wrappers around root `pipelines/tomorrow/` and
`pipelines/next_3_days/` scripts. PJM-backed `_shared.py` owns the PJM query
builder helper for the root tomorrow script, and its nested `forecast_*`
modules remain old-path compatibility wrappers.

The pipeline entrypoints accept optional old-repo parity knobs:
`pool_start_date`, `pool_year_months`, and
`feature_group_weights_override`. Defaults stay simple and use the rolling
`history_days` window without a hand-picked pool universe.

## Output Contract

The promoted KNN Sunny runners return the shared PJM DA model envelope
documented in `backend/modelling/pjm_da_models/README.md` while preserving the
legacy output contract without importing the legacy report module.

Single-day canonical pandas tables are under `tables` as `forecast`, `output`,
`quantiles`, `analogs`, `target_features`, and `actuals`. The legacy top-level
aliases remain available:

```text
df_forecast, output_table, quantiles_table, analogs, metrics,
target_features, target_features_by_hour, feature_weights, day_type,
has_actuals, n_pool, run_id, run_date, cutoff_utc
```

`output_table` is the legacy-style horizontal `Actual` / `Forecast` / `Error`
table when actuals are available, or the single `Forecast` row for forward
dates. `quantiles_table` is the displayed P25/P37.5/P50/Forecast/P62.5/P75
band view, with OnPeak/OffPeak/Flat summary bands built from joint analog
draws. The underlying hourly forecast frame carries the wider migrated
quantile set used for metrics:

Target-date actual DA LMPs are loaded separately from the promoted actuals SQL
for display and metrics. They are not appended to the historical analog pool.

```text
P01, P05, P10, P25, P37.5, P50, P62.5, P75, P90, P95, P99
```

Multi-day Meteologica runners expose canonical `tables` entries for `strip`,
`forecast`, `actuals`, and the per-date forecast, quantile, analog, target
feature, and output maps. The legacy strip plus per-date maps remain available:

```text
strip_table, forecasts_by_date, bands_by_date, analogs_by_date,
queries_by_date, output_tables_by_date, metrics_by_date, results_by_date
```

Terminal reports are generated by
`backend/modelling/pjm_da_models/like_day_model_knn_sunny/reporting.py` and use
the shared PJM DA table formatter for horizontal, colored, two-decimal tables.

The KNN pipelines use the same package-root PJM DA runtime helpers as
`meteo_baseline_price`: read-only DB access from `../db.py`, promoted SQL
artifact loading/date cutoffs from `../runtime.py`, and terminal reporting from
`../logging_utils.py`, `../reporting.py`, and the package-local migrated output
builders in `reporting.py`. Log and entrypoint names follow
`pjm_da_like_day_knn_sunny_<input_family>_<horizon>` so local file logs and
operator output match the model folder structure.

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
