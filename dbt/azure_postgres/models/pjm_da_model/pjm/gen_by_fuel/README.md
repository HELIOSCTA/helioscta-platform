# PJM Generation By Fuel Inputs

Read-only input SQL for PJM DA model historical renewable features.

Source tables:

- `pjm.gen_by_fuel`
- `pjm.hourly_solar_power_forecast`
- `pjm.hourly_wind_power_forecast`

Actual source grain is `datetime_beginning_ept x fuel_type`; forecast source
grain is `evaluated_at_ept x datetime_beginning_ept`. Phase 1 uses the latest
solar/wind forecast available by the old DA cutoff boundary as the preferred
historical feature, then falls back to actual `gen_by_fuel` rows. The shaped
artifact returns one row per `date x hour_ending` with `solar_at_hour` and
`wind_at_hour`.

Default compile parameters:

```text
start_date = current EPT date - 730 days
end_date = current EPT date - 1 day
```
