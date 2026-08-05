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
- `logging_utils.py` and `reporting.py`: terminal logger/report helpers used by
  all PJM DA model pipelines.

Model-family packages may keep compatibility wrappers, but new loaders and
pipelines should import the shared package-root helpers instead of duplicating
SQL-root, cutoff, DB, or terminal logging code.

Current scope is read-only. Model output table publication, scheduling, and
rerun/upsert contracts should be added only after an output owner, grain, and
uniqueness key are confirmed. The local DEV Meteo Baseline frontend route also
uses this read-only contract: it reads the same promoted SQL files from
TypeScript and executes them with `helios_readonly` instead of caching model
outputs into database tables.
