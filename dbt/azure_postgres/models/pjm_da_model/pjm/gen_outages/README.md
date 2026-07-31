# PJM Generation Outage Inputs

Read-only input SQL for PJM DA model daily outage features.

Source tables:

- `pjm.gen_outages_by_type`
- `pjm.frcstd_gen_outages`

Historical source grain is `forecast_date x forecast_execution_date_ept x
region`; Phase 1 uses the lead-1 forecast vintage (`forecast_execution_date_ept
= forecast_date - 1`) from raw `region = 'PJM RTO'` rows and normalizes that
label to the Python-facing `region = 'RTO'` contract used by the old model.
`Western` and `Mid Atlantic - Dominion` are likewise normalized to `WEST` and
`MIDATL_DOM` for inspection parity.

Forward/latest outage features also use `pjm.gen_outages_by_type`, selecting
the latest execution at or before `cutoff_date` for each forecast date. The
separate `pjm.frcstd_gen_outages` table remains source-wrapped for inspection,
but its current RTO forecast MW column is not used by the shaped model input.

Both shaped artifacts return one row per `date` with `outage_total_mw`, which
the Python loader broadcasts across all 24 hours.
