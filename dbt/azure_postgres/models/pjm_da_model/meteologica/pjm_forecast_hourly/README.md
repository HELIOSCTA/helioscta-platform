# Meteologica PJM Forecast Hourly Inputs

Read-only input SQL for PJM DA model features that need the regional
Meteologica supply-demand forecast.

Source table:

- `meteologica.pjm_forecast_hourly`

Source grain is `content_id x update_id x metric x forecast_area x
forecast_period_start`. Phase 1 uses `region = 'PJM'`, `forecast_area = 'RTO'`,
and metrics `load`, `solar`, and `wind`.

The shaped forecast artifact returns one row per `date x hour_ending` with:

- `load_mw_at_hour`
- `solar_at_hour`
- `wind_at_hour`
- `net_load_at_hour`

Default compile parameters:

```text
start_date = current EPT date + 1 day
end_date = current EPT date + 14 days
cutoff_utc = current EPT date at 10:00 EPT, converted to UTC timestamptz
region = PJM
forecast_area = RTO
```
