# PJM DA LMP Hourly Inputs

Read-only input SQL for PJM DA modelling that depends on PJM hourly day-ahead
LMP actuals.

Source table:

- `pjm.da_hrl_lmps`

Source grain is PJM hourly LMP rows by pnode and beginning timestamp. The current
input model filters to one delivery date, one hub, and current rows only. These
models compile bounded input SQL for the temporary Meteologica baseline price
prototype; they do not create database objects. This folder owns the dbt source
definition, the immediate `src_*` wrapper, and the shaped hourly actuals input.

Compile from `dbt/azure_postgres`:

```powershell
dbt compile --profiles-dir . --select +path:models/pjm_da_model/pjm/da_lmps_hourly
```

By default, compiled SQL is directly runnable with embedded defaults:

```text
target_date = current EPT date - 3 days
hub = WESTERN HUB
```

Compile with `--vars "{pjm_da_model_param_mode: runtime}"` before promotion when
the Python loader needs bound parameters in the promoted SQL.
