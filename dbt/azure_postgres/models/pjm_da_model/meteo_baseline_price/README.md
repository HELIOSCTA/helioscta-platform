# PJM Meteo Baseline Price

Read-only dbt model family for compiling prototype runtime SQL consumed by
`tmp/pjm_like_day_modelling/meteo_baseline_price`.

This family does not create database objects. Models are `ephemeral` and are
compiled, validated, then promoted to:

```text
tmp/data/pjm_like_day_modelling/meteo_baseline_price/sql/
```

Runtime code must read the promoted SQL files, not dbt `target/compiled`
directly.

## Layout

```text
models/pjm_da_model/meteo_baseline_price/
  marts/  # Forecast/actual model outputs promoted to tmp/data
  utils/  # Runtime helper SQL, such as available date discovery

models/pjm_da_model/meteologica/
  # Meteologica schema source wrappers and source YAML

models/pjm_da_model/pjm/
  # PJM schema source wrappers and source YAML
```

## Source Contract

- Deterministic price forecast:
  `meteologica.usa_pjm_western_hub_da_power_price_forecast_hourly`
- ECMWF ENS price forecast:
  `meteologica.usa_pjm_western_hub_da_power_price_forecast_ecmwf_ens_hourly`
- PJM DA LMP actuals:
  `pjm.da_hrl_lmps`

Forecast source grain is `content_id x update_id x forecast_period_start`.
The outward forecast artifact returns one row per delivery date x hour ending,
using a selected latest issue per date and deduplicating by forecast hour.
The mart filters `forecast_period_start` with timestamp ranges so Postgres can
use source-table indexes on the timestamp column.
`utils/mbp_available_target_dates.sql` supports horizon/date-picker workflows;
it is not a core pricing mart.

## Compile And Promote

From `dbt/azure_postgres`:

```powershell
dbt compile --profiles-dir . --select +path:models/pjm_da_model/meteo_baseline_price
python scripts/promote_pjm_meteo_baseline_price_sql.py
```

After promotion, run the local plan smoke from the repo root or prototype
folder:

```powershell
python tmp\pjm_like_day_modelling\meteo_baseline_price\explain_sql.py
```
