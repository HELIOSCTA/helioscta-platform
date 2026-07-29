# PJM Analyst Source Map

Use this map to choose evidence for read-only PJM analyst work. Check actual
schemas before relying on any column not already documented in the repo.

## Core Price Tables

- `pjm.da_hrl_lmps`: PJM Data Miner day-ahead hourly LMPs.
  - Grain: `datetime_beginning_utc x pnode_id x pnode_name x row_is_current x version_nbr`.
  - Freshness: `updated_at`.
  - Typical use: DA actuals, component attribution, DA model miss comparison.
- `pjm.rt_hrl_lmps`: verified hourly RT LMPs.
  - Grain: `datetime_beginning_utc x pnode_id x pnode_name x row_is_current x version_nbr`.
  - Typical use: verified RT settlement-quality comparison and DART context.
- `pjm.rt_unverified_hrl_lmps`: short-retention unverified hourly RT LMPs.
  - Grain: `datetime_beginning_utc x pnode_name x type`.
  - Typical use: current operating-day context before verified RT is available.
- `pjm.rt_fivemin_hrl_lmps`: verified five-minute RT hub/zonal/interface LMPs.
  - Typical use: intraday volatility and scarcity-hour diagnosis after finalization.

## Forecast And Fundamental Context

- `pjm.load_frcstd_7_day`: PJM seven-day load forecasts.
- `pjm.hourly_solar_power_forecast`: PJM solar forecast rows.
- `pjm.hourly_wind_power_forecast`: PJM wind forecast rows.
- `meteologica.pjm_forecast_hourly`: Meteologica load, solar, and wind forecasts
  for `RTO`, `MIDATL`, `SOUTH`, and `WEST`.
- `meteologica.usa_pjm_western_hub_da_power_price_forecast_hourly`: Western Hub
  deterministic DA price forecasts.
- `meteologica.usa_pjm_western_hub_da_power_price_forecast_ecmwf_ens_hourly`:
  Western Hub ECMWF ensemble DA price forecasts.
- `weather.wsi_hourly_forecasts` and `weather.wsi_hourly_observed_temperatures`:
  WSI station-level weather forecast and observed context.

## Ops Summary, Constraints, And Outages

- `pjm.ops_sum_frcstd_tran_lim`: forecast transfer limits.
- `pjm.ops_sum_frcst_peak_rto`: capacity peak RTO values.
- `pjm.ops_sum_frcst_peak_area`: capacity peak area values.
- `pjm.ops_sum_prjctd_tie_flow`: projected scheduled tie flow by interface.
- `pjm.ops_sum_prev_period`: prior-period actuals by area.
- `pjm.da_transconstraints`: day-ahead transmission constraint rows.
- `pjm.da_reserve_market_results`: day-ahead reserve market results and MCPs.
- `pjm.gen_outages_by_type` and `pjm.frcstd_gen_outages`: generation outage
  actual/forecast context.
- `pjm.transmission_outages_raw`: raw PJM eDART transmission outage snapshots.

## Model Input Artifacts

The active PJM DA modelling input SQL lives under `dbt/azure_postgres/models/pjm_da_model`.
For source contracts and generated tmp SQL, use the `pjm-da-model-inputs`
skill before editing model SQL or interpreting source model folders.

## Telemetry

- `ops.api_fetch_log`: source fetch status, failures, row counts, and metadata.
- `ops.data_availability_events`: complete/partial/stale readiness signals for
  promoted critical datasets.

## Query Discipline

- Use `select` only.
- Set explicit date windows.
- Aggregate before sampling details.
- Limit detail samples to the smallest set that supports the memo.
- Report source freshness and row coverage before interpretation.
