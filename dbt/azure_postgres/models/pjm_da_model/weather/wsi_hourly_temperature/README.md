# WSI Hourly Temperature Inputs

Read-only input SQL for PJM DA model hourly temperature features.

Source tables:

- `weather.wsi_hourly_observed_temperatures`
- `weather.wsi_hourly_forecasts`

Observed source grain is `station_id x region x observation_time_local`; the
shaped history artifact averages PJM station `temp_f` to one row per
`date x hour_ending`.

Forecast source grain is `station_id x region x forecast_issued_at_utc x
forecast_time_utc`; the shaped forecast artifact selects each station's latest
issue for a forecast hour, converts UTC forecast time to PJM EPT date/hour, and
averages station `temp_f` to one row per `date x hour_ending`.

Default compile parameters:

```text
start_date = current EPT date - 730 days for history, current EPT date + 1 day for forecast
end_date = current EPT date - 1 day for history, current EPT date + 14 days for forecast
region = PJM
cutoff_utc = current EPT date at 10:00 EPT, converted to UTC timestamptz for forecast
```
