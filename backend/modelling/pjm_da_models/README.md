# PJM DA Models

Backend-owned read-only PJM day-ahead model runners live here. dbt remains the
source of truth for input SQL under
`dbt/azure_postgres/models/pjm_da_model/<source_schema>/<table_family>/`.

Runtime SQL is generated and committed under `sql_inputs/` for deployment
stability. Refresh it from `dbt/azure_postgres`:

```powershell
dbt compile --profiles-dir . --select +path:models/pjm_da_model --vars "{pjm_da_model_param_mode: runtime}"
python scripts/promote_pjm_da_model_backend_sql.py
```

Current model families:

- `meteo_baseline_price`: Meteologica Western Hub DA price baseline.
- `like_day_model_knn_sunny`: PJM RTO hourly like-day KNN Sunny forecasts.

Shared backend runtime helpers live at the package root:

- `db.py`: read-only `helios_prod` Postgres connection boundary.
- `runtime.py`: SQL artifact loading, 10:00 EPT cutoff defaults, and common
  date/hour normalization helpers.
- `source_registry.py`: promoted SQL input artifact contracts, source tables,
  grains, runtime params, and consuming model families.
- `result_envelope.py`: shared runner result envelope and canonical log-name
  helpers.
- `logging_utils.py` and `reporting.py`: terminal logger/report helpers used by
  all PJM DA model pipelines.
- `pipelines/`: canonical thin entrypoint scripts grouped by horizon:
  `tomorrow/`, `next_3_days/`, and `next_14_days/`.

Model-family packages own their orchestration helpers and non-default horizon
runners. Root `backend.modelling.pjm_da_models.pipelines` scripts should stay
thin and delegate into those owning folders. Loaders, builders, configs, model
math, and committed `sql_inputs/` stay in their owning packages and continue to
import shared package-root helpers instead of duplicating SQL-root, cutoff, DB,
or terminal logging code.

Nested model-family `pipelines/` folders are not the canonical command surface.
They hold shared helper modules such as `_shared.py` plus old `forecast_*`
module paths that delegate to the root horizon scripts where a root horizon
script exists.

Current scope is read-only. Model output table publication, scheduling, and
rerun/upsert contracts should be added only after an output owner, grain, and
uniqueness key are confirmed. The local DEV Meteo Baseline frontend route also
uses this read-only contract: it reads the same promoted SQL files from
TypeScript and executes them with `helios_readonly` instead of caching model
outputs into database tables.

## Runner Contract

Every pipeline `run()` returns a shared envelope:

```text
model_family, model_name, input_family, horizon, run_id, run_date,
target_date, target_dates, hub, cutoff_utc, include_actuals,
status, tables, diagnostics
```

`status` carries row counts, `has_actuals`, `features_complete`, and warning
strings. `tables` carries canonical pandas outputs keyed by purpose.
`diagnostics` carries promoted SQL artifact metadata, artifact filenames,
source freshness timestamps when available, and model settings.

Legacy top-level DataFrame keys remain as compatibility aliases. Script and
interactive logger names use `pjm_da_<model_family>_<input_family>_<horizon>`.
