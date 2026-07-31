# KNN Sunny Non-Calendar Migration Audit

This audit compares the current `helios_prod` implementation to the old
`helioscta-pjm-da-data-scrapes` like-day KNN Sunny source contracts. Calendar
dbt migration is intentionally excluded.

| Source family | Current implementation | Old behavior | Parity |
| --- | --- | --- | --- |
| DA LMP labels | `pjm/da_lmps_hourly` reads `pjm.da_hrl_lmps`, default `WESTERN HUB`, `row_is_current = true`. | `pjm_lmps_hourly` DA rows, Western Hub default, optional system-energy label. | Complete for default DA hub label and SEP column. |
| RTO actual load | `pjm/rto_load_hourly` reads metered load and falls back to preliminary load. | Metered > prelim > instantaneous. | Partial; instantaneous load source is not migrated. |
| RTO load forecast | `pjm/load_forecast_hourly` adds historical lead-1 and latest-at-cutoff RTO load forecast inputs. | DA-cutoff historical mart using latest issue in 48h pre-10:00 EPT window. | Complete for available `helios_prod` load forecast sources. |
| Renewables | `pjm/gen_by_fuel` exposes PJM forecast columns, PJM actual columns, and latest forecast input; Python fills PJM forecast -> Meteologica forecast -> actual. | Lead-1 PJM forecast -> lead-1 Meteologica forecast -> realized fuel mix for pool; query forecast-first without realized fallback. | Complete except any old actual source not present in `helios_prod`. |
| Meteologica RTO | `meteologica/pjm_forecast_hourly` now has historical lead-1 and latest-at-cutoff RTO inputs with 48h cutoff window. | Historical as-of marts and latest-only full-coverage loader. | Partial; current dbt is ephemeral/source-input, not durable all-as-of marts. |
| WSI temperature | Python uses observed-first coalescing for pool and forecast-first with observed fallback for query. | Observed-first pool, forecast-first query. | Complete for available WSI observed/forecast sources. |
| Outages | `pjm/gen_outages` uses `gen_outages_by_type` lead-1 history and latest-at-cutoff forecast. | Lead-1 forecast, actual fallback for pool; query forecast-only with forward fill in horizon. | Partial; outage actual fallback is not migrated because a distinct current actual source was not identified. |
| Gas | `ice_python/settlements` uses D1 settlement trade date and simple next-day/weekend gas-day logic. | ICE gas-day spine with non-trading-day calendar and 14 hub columns. | Partial by design; holiday/non-trading-day calendar migration is excluded. |
| Calendar | Python derives weekday/weekend/sin/cos and sets `is_nerc_holiday = 0`. | `pjm_dates_daily` with NERC/federal/soft holidays. | Intentionally excluded. |
