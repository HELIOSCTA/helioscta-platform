# Meteologica Baseline Price

Backend-owned direct-read model for the Meteologica Western Hub day-ahead price
baseline. The model reads committed runtime SQL from
`backend/modelling/pjm_da_models/sql_inputs/`, binds parameters at execution
time, and does not publish, schedule, write to Postgres, or create database
objects.

## Source Contract

- Deterministic forecast:
  `meteologica.usa_pjm_western_hub_da_power_price_forecast_hourly`
- ECMWF ENS forecast:
  `meteologica.usa_pjm_western_hub_da_power_price_forecast_ecmwf_ens_hourly`
- Actual DA LMP:
  `pjm.da_hrl_lmps`

Forecast grain is `content_id x update_id x forecast_period_start`. The loader
selects the latest issue per selected delivery date bounded by `cutoff_utc` and
`lead_days`, then deduplicates to one row per forecast hour. When `cutoff_utc`
is omitted, the pipeline resolves it to 10:00 EPT on the relevant run date and
passes the equivalent UTC timestamp into SQL.

## SQL Promotion

Runtime SQL is generated from source-owned dbt models:

- `dbt/azure_postgres/models/pjm_da_model/meteologica/da_price_forecast`
- `dbt/azure_postgres/models/pjm_da_model/pjm/da_lmps_hourly`

Refresh committed backend SQL from `dbt/azure_postgres`:

```powershell
dbt compile --profiles-dir . --select +path:models/pjm_da_model --vars "{pjm_da_model_param_mode: runtime}"
python scripts/promote_pjm_da_model_backend_sql.py
```

Each generated SQL file has a header naming the dbt model, compiled SQL path,
and promotion script. Do not edit files under `sql_inputs/` by hand.

## Commands

```powershell
python -m backend.modelling.pjm_da_models.meteo_baseline_price
python -m backend.modelling.pjm_da_models.meteo_baseline_price.pipelines.forecast_tomorrow
python -m backend.modelling.pjm_da_models.meteo_baseline_price.pipelines.forecast_next_3_days
python -m backend.modelling.pjm_da_models.meteo_baseline_price.pipelines.forecast_full_prediction_window
```

The one-day pipeline defaults to tomorrow, `lead_days=1`, and a 10:00 EPT
cutoff. Pass `lead_days=None` to relax the lead-day vintage while still keeping
the run-date cutoff unless `cutoff_utc` is explicit.

This model uses the shared PJM DA package-root runtime helpers for read-only DB
access, promoted SQL artifact loading, cutoff defaults, and terminal logging.
The local `db.py` and `logging_utils.py` files are compatibility wrappers for
older imports.

## Frontend DEV Runtime

The local DEV frontend page `/?section=pjm-da-model` presents this workflow as
`PJM DA Model` without writing output rows to Postgres. The route
`GET /api/pjm-da-meteo-baseline-price` reads the committed promoted SQL
artifacts from `backend/modelling/pjm_da_models/sql_inputs/`, converts the
generated `%(name)s` placeholders to `pg` parameters in TypeScript, and queries
`helios_prod` with `helios_readonly`.

Supported route params are bounded:

```text
horizon=tomorrow|next3|full
runDate=YYYY-MM-DD
targetDate=YYYY-MM-DD
limit=1..60
includeActuals=0|1
refresh=1
```

Defaults match the Python runner: tomorrow uses `lead_days=1`; horizon runs use
`lead_days=null`; omitted cutoff resolves to 10:00 America/New_York on the run
date and is passed to SQL as UTC. Cache scope is non-persistent only: browser
session/client JSON cache plus process-local route cache. There is no model
output table, database cache, or backend writer for this DEV path.

## Plan Check

After changing dbt SQL and promoting artifacts, run from this directory:

```powershell
python explain_sql.py
```

The script runs `EXPLAIN (ANALYZE, BUFFERS)` against the promoted forecast,
actuals, and available-date SQL with default backend parameters.
