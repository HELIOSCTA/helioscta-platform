# ERCOT Public Reports Feed Selection

This note records which ERCOT Public Reports feeds are worth pulling into this
project and which feeds should stay out of the first promotion wave.

Source reviewed on 2026-06-13:

- ERCOT Data Product Details pages under `https://www.ercot.com/mp/data-products/`.
- ERCOT Public Reports base URL: `https://api.ercot.com/api/public-reports`.
- Live API probe for `NP6-905-CD` endpoint
  `np6-905-cd/spp_node_zone_hub`.

## Selection Rules

Promote feeds that support ERCOT price formation, hub basis, load and renewable
context, outage risk, congestion, or reference data needed to join those
datasets.

Defer reports that are billing, settlement-charge detail, credit, market notice,
administrative, or ad hoc unless a downstream consumer requires them.

High-frequency feeds should stay scoped to the four hub settlement points until
there is a clear consumer for all nodes, zones, or resources.

## Current Production Criticality

- `dam_stlmnt_pnt_prices` provides day-ahead hub price readiness.
- `settlement_point_prices` provides real-time hub price collection and
  complete-day readiness.
- `rt_price_adders_sced` and `rt_price_adders_15min` provide real-time price
  adder formation at SCED and settlement-interval grains.
- `actual_system_load` and `seven_day_load_forecast` are support feeds in the
  daily ERCOT load batch; they are not critical readiness gates.

## Pull Tiers

### Tier 0 - Promoted Or In Flight

| Feed | ERCOT product | Endpoint | Runtime stance |
|---|---|---|---|
| dam_stlmnt_pnt_prices | NP4-190-CD | np4-190-cd/dam_stlmnt_pnt_prices | Deployed; daily critical timer |
| settlement_point_prices | NP6-905-CD | np6-905-cd/spp_node_zone_hub | Deployed; 15-minute critical timer |
| actual_system_load | NP6-346-CD | np6-346-cd/act_sys_load_by_fzn | Promoted; daily load support batch |
| dam_shadow_prices | NP4-191-CD | np4-191-cd/dam_shadow_prices | Promoted; daily congestion support batch |
| sced_shadow_prices | NP6-86-CD | np6-86-cd/shdw_prices_bnd_trns_const | Promoted; daily congestion support batch |
| rt_price_adders_sced | NP6-323-CD | np6-323-cd/rt_price_adder_sced | Promoted; daily price-adder support batch |
| rt_price_adders_15min | NP6-324-CD | np6-324-cd/rt_15min_price_adders | Promoted; daily price-adder support batch |
| wind_power_production_hourly | NP4-732-CD | np4-732-cd/wpp_hrly_avrg_actl_fcast | Promoted; daily renewables support batch |
| solar_power_production_hourly | NP4-737-CD | np4-737-cd/spp_hrly_avrg_actl_fcast | Promoted; daily renewables support batch |
| wind_power_actual_5min | NP4-733-CD | np4-733-cd/wpp_actual_5min_avg_values | Promoted; daily 5-minute renewables actual support batch |
| solar_power_actual_5min | NP4-738-CD | np4-738-cd/spp_actual_5min_avg_values | Promoted; daily 5-minute renewables actual support batch |
| hourly_resource_outage_capacity | NP3-233-CD | np3-233-cd/hourly_res_outage_cap | Promoted; daily outage/capacity support batch |
| short_term_system_adequacy | NP3-763-CD | np3-763-cd/st_sys_adequacy | Promoted; daily outage/capacity support batch |
| seven_day_load_forecast | NP3-565-CD | np3-565-cd/lf_by_model_weather_zone | Promoted; daily load support batch |

### Tier 1 - Promote Next

| Feed area | Why pull |
|---|---|
| Ancillary service prices and awards | Reserve market analytics |

### Tier 2 - Promote When The Use Case Needs It

| Feed area | Why pull later |
|---|---|
| Ancillary service prices and awards | Reserve market analytics |
| Binding constraints and contingencies | Deeper congestion diagnostics |
| Settlement charge detail | Back-office reconciliation rather than first-pass market analytics |
| Credit and collateral reports | Specialized risk workflow |
| Market notices and documents | Requires document/file handling and consumer design |

## Recommended Promotion Order

1. Ancillary service prices and awards

## Per-Feed Promotion Contract

For every ERCOT Public Reports feed promoted from this selection note:

- Backend module name and destination table name should match the selected
  snake_case feed name.
- Destination schema is `ercot`.
- Table and index DDL is managed outside this repo and must be applied before scheduling.
- Enabled SQL files stay read-only: source, staging, and final shaping models.
- The source contract must document EMIL ID, report type ID, endpoint, display
  name, grain, uniqueness key, freshness field, and runtime filters.
- Runtime writes use backend `helios_admin` upserts.
- Initial promotion does not backfill unless explicitly requested.
- High-frequency feeds must use a bounded default lookback and source filters
  when ERCOT supports them.
