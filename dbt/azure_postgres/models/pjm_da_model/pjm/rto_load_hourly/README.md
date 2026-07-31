# PJM RTO Load Hourly Inputs

Read-only input SQL for PJM DA model features that need historical RTO load.

Source table:

- `pjm.hrl_load_metered`

Source grain is `datetime_beginning_ept x load_area`; Phase 1 uses
`load_area = 'RTO'`. The shaped history artifact returns one row per
`date x hour_ending` with `load_mw_at_hour`.

Default compile parameters:

```text
start_date = current EPT date - 730 days
end_date = current EPT date - 1 day
load_region = RTO
```

Compile in runtime mode before promotion when Python should bind the date
window and region:

```powershell
dbt compile --profiles-dir . --select +path:models/pjm_da_model/pjm/rto_load_hourly --vars "{pjm_da_model_param_mode: runtime}"
```
