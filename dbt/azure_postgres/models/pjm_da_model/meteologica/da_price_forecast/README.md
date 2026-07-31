# Meteologica DA Price Forecast Inputs

Read-only input SQL for PJM DA modelling that depends on Meteologica Western
Hub DA price forecast sources.

Source tables:

- `meteologica.usa_pjm_western_hub_da_power_price_forecast_hourly`
- `meteologica.usa_pjm_western_hub_da_power_price_forecast_ecmwf_ens_hourly`

Source grain is `content_id x update_id x forecast_period_start`. These models
compile bounded input SQL for the temporary Meteologica baseline price prototype;
they do not create database objects. This folder owns the dbt source definition,
the immediate `src_*` wrappers, available-date discovery, and the shaped hourly
forecast input.

Compile from `dbt/azure_postgres`:

```powershell
dbt compile --profiles-dir . --select +path:models/pjm_da_model/meteologica/da_price_forecast
```

By default, compiled SQL is directly runnable with embedded defaults:

```text
target_date = current EPT date - 3 days
start_date = current EPT date + 1 day
cutoff_utc = current EPT date at 10:00 EPT, converted to UTC timestamptz
lead_days = 1
limit = 60
```

Compile with `--vars "{pjm_da_model_param_mode: runtime}"` before promotion when
the Python loader needs bound parameters in the promoted SQL.
