# PJM Data Miner 2 Scrape Catalogue

This catalogue tracks PJM Data Miner 2 feeds promoted or queued from the
PJM Data Miner 2 API. Legacy module names are retained only as a migration
crosswalk where a feed existed in the old repo:

```text
C:\Users\AidanKeaveny\Documents\github\helioscta-azure-backend\backend\scrapes\power\pjm
```

Promotion rule for this repo:

- New backend scrape module names, pipeline names, and destination table names
  should match the PJM Data Miner 2 feed short name exactly.
- New feed contracts should be derived from PJM Data Miner 2 metadata, not from
  legacy implementation code.
- Destination schema is `pjm`.
- Runtime writes use the backend `helios_admin` path and upsert into direct
  tables documented by disabled dbt `table_*.sql` operator SQL.
- dbt models are read-only validation and query shaping under
  `dbt/azure_postgres/models/power/pjm/<feed_short_name>/`.
- Backfills are out of scope for the initial migration pass unless explicitly
  requested.

Feed selection and promotion priority are documented in
`docs/data-catalogue/pjm-data-miner-2-feed-selection.md`.

## Current Build List

| PJM feed/table name | Display name | Scope | Runtime filter | Destination |
|---|---|---|---|---|
| pnode | Pricing Nodes | Active pricing-node reference data | termination_date = 12/31/9999 exact | pjm.pnode |
| rt_fivemin_hrl_lmps | Real-Time Five Minute LMPs | Verified five-minute RT pricing | Active hub, zone, and interface pnode IDs with current rows only | pjm.rt_fivemin_hrl_lmps |
| five_min_tie_flows | Five Minute Tie Flows | Five-minute actual/scheduled tie flows | Datetime window only | pjm.five_min_tie_flows |
| act_sch_interchange | Actual/Schedule Summary Report | Imports and Exports | datetime_beginning_ept window | pjm.act_sch_interchange |
| agg_definitions | Fixed Weighted Average Aggregate Definitions | LMP Model | Static current definition filter | pjm.agg_definitions |
| ancillary_services | Real-Time Ancillary Service Hourly LMPs | Locational Marginal Prices | datetime_beginning_ept window | pjm.ancillary_services |
| da_interface_flows_and_limits | Day Ahead Interface Flows and Limits | Imports and Exports | datetime_beginning_ept window | pjm.da_interface_flows_and_limits |
| da_marginal_value | Day-Ahead Marginal Value | Constraints | datetime_beginning_ept window | pjm.da_marginal_value |
| da_transconstraints | Day-Ahead Transmission Constraints | Constraints | datetime_beginning_ept window | pjm.da_transconstraints |
| day_gen_capacity | Daily Generation Capacity | Generation | bid_datetime_beginning_ept window | pjm.day_gen_capacity |
| dispatched_reserves | Dispatched Reserves | Ancillary Services | datetime_beginning_ept window | pjm.dispatched_reserves |
| five_min_solar_generation | Five Minute Solar Generation | Generation | datetime_beginning_ept window | pjm.five_min_solar_generation |
| gen_by_fuel | Generation by Fuel Type | Generation | datetime_beginning_ept window | pjm.gen_by_fuel |
| rt_and_self_ecomax | Scheduled Generation | Generation | datetime_beginning_ept window | pjm.rt_and_self_ecomax |
| load_frcstd_hist | Historical Load Forecasts | Load Forecast | forecast_hour_beginning_ept window | pjm.load_frcstd_hist |
| hrl_load_metered | Hourly Load: Metered | Load | datetime_beginning_ept window | pjm.hrl_load_metered |
| hrl_load_prelim | Hourly Load: Preliminary | Load | datetime_beginning_ept window | pjm.hrl_load_prelim |
| hrl_dmd_bids | Hourly Demand Bid Data | Bid and Offer Data | datetime_beginning_ept window | pjm.hrl_dmd_bids |
| frcstd_gen_outages | Forecasted Generation Outages | Generation | forecast_execution_date_ept window | pjm.frcstd_gen_outages |
| rt_dispatch_reserves | Real-Time Dispatched Reserves | Ancillary Services | datetime_beginning_ept window | pjm.rt_dispatch_reserves |
| reserve_market_results | Real-Time Ancillary Service Market Results | Ancillary Services | datetime_beginning_ept window | pjm.reserve_market_results |
| rt_default_mv_override | Real-Time Default Marginal Value Override | Constraints | posted_day window | pjm.rt_default_mv_override |
| rt_marginal_value | Real-Time Marginal Value | Constraints | datetime_beginning_ept window | pjm.rt_marginal_value |
| rt_short_term_mv_override | Real-Time Short-Term Marginal Value Override | Constraints | posted_day window | pjm.rt_short_term_mv_override |
| rt_unverified_hrl_lmps | Real-Time Unverified Hourly LMPs | Locational Marginal Prices | Current hub, zone, and interface rows only | pjm.rt_unverified_hrl_lmps |
| load_frcstd_7_day | Seven-Day Load Forecast | Load Forecast | Current PJM snapshot endpoint | pjm.load_frcstd_7_day |
| ops_sum_frcstd_tran_lim | Operations Summary - Forecast Transfer Limits | System Information | projected_peak_datetime_ept window | pjm.ops_sum_frcstd_tran_lim |
| ops_sum_frcst_peak_area | Operations Summary - Projected Area Statistics at Peak | System Information | projected_peak_datetime_ept window | pjm.ops_sum_frcst_peak_area |
| ops_sum_frcst_peak_rto | Operations Summary - Projected RTO Statistics at Peak | System Information | projected_peak_datetime_ept window | pjm.ops_sum_frcst_peak_rto |
| ops_sum_prev_period | Operations Summary - Actual Operational Statistics | System Information | datetime_beginning_ept window | pjm.ops_sum_prev_period |
| ops_sum_prjctd_tie_flow | Operations Summary - Projected Scheduled Tie Flow | System Information | projected_peak_datetime_ept window | pjm.ops_sum_prjctd_tie_flow |
| gen_outages_by_type | Generation Outage for Seven Days by Type | Generation | forecast_execution_date_ept window | pjm.gen_outages_by_type |
| solar_gen | Solar Generation | Generation | datetime_beginning_ept window | pjm.solar_gen |
| wind_gen | Wind Generation | Generation | datetime_beginning_ept window | pjm.wind_gen |

## Promotion Queue

| Status | PJM feed/table name | Display name | Legacy module | Legacy target | Posting | Retention | Primary key for upsert |
|---|---|---|---|---|---|---|---|
| Promoted | da_hrl_lmps | Day-Ahead Hourly LMPs | da_hrl_lmps | da_hrl_lmps | Daily | Indefinitely | datetime_beginning_utc, pnode_id, pnode_name, row_is_current, version_nbr |
| Promoted | rt_hrl_lmps | Real-Time Hourly LMPs | rt_hrl_lmps | rt_settlements_verified_hourly_lmps | Daily on Business Days | Indefinitely | datetime_beginning_utc, pnode_id, pnode_name, row_is_current, version_nbr |
| Promoted | unverified_five_min_lmps | Unverified Five Minute LMPs | unverified_five_min_lmps | unverified_five_min_lmps | Every 5 minutes | 30 days | datetime_beginning_utc, datetime_beginning_ept, name, type |
| Promoted | rt_fivemin_mnt_lmps | Settlements Verified Five Minute LMPs | none | none | Daily on Business Days | Indefinitely | datetime_beginning_utc, pnode_id, pnode_name |
| Promoted | rt_fivemin_hrl_lmps | Real-Time Five Minute LMPs | none | none | Daily On Business Days | Indefinitely | datetime_beginning_utc, pnode_id, pnode_name |
| Promoted | five_min_tie_flows | Five Minute Tie Flows | none | none | Every 5 minutes | 30 days | datetime_beginning_utc, datetime_beginning_ept, tie_flow_name |
| Promoted | pnode | Pricing Nodes | none | none | Daily on Business Days | Indefinitely | pnode_id |
| Promoted | act_sch_interchange | Actual/Schedule Summary Report | none | none | Weekly | Indefinitely | datetime_beginning_utc, tie_line |
| Promoted | agg_definitions | Fixed Weighted Average Aggregate Definitions | none | none | Daily | Indefinitely | agg_pnode_id, bus_pnode_id, effective_date_ept |
| Promoted | ancillary_services | Real-Time Ancillary Service Hourly LMPs | none | none | Daily on Business Days | Indefinitely | datetime_beginning_utc, datetime_beginning_ept, ancillary_service, row_is_current, version_nbr |
| Promoted | da_interface_flows_and_limits | Day Ahead Interface Flows and Limits | none | none | Daily | Indefinitely | datetime_beginning_utc, interface_limit_name |
| Promoted | da_marginal_value | Day-Ahead Marginal Value | none | none | Daily | Indefinitely | datetime_beginning_utc, monitored_facility, contingency_facility |
| Promoted | da_transconstraints | Day-Ahead Transmission Constraints | none | none | Daily | Indefinitely | datetime_beginning_utc, day_ahead_congestion_event, monitored_facility, contingency_facility |
| Promoted | day_gen_capacity | Daily Generation Capacity | none | none | Daily | Indefinitely | bid_datetime_beginning_utc |
| Promoted | dispatched_reserves | Dispatched Reserves | none | none | Every 5 minutes | 30 days | datetime_beginning_utc, datetime_beginning_ept, area, reserve_type |
| Queued | inst_load | Instantaneous Load | five_min_instantaneous_load | five_min_instantaneous_load_v1_2025_oct_15 | Every 5 minutes | 30 days | datetime_beginning_utc, datetime_beginning_ept, area |
| Promoted | five_min_solar_generation | Five Minute Solar Generation | none | none | Every 5 minutes | 30 days | datetime_beginning_utc |
| Promoted | gen_by_fuel | Generation by Fuel Type | none | none | Hourly | Indefinitely | datetime_beginning_utc, fuel_type |
| Promoted | rt_and_self_ecomax | Scheduled Generation | none | none | Daily | Indefinitely | datetime_beginning_utc |
| Promoted | load_frcstd_hist | Historical Load Forecasts | none | none | Daily | Indefinitely | evaluated_at_utc, evaluated_at_ept, forecast_hour_beginning_utc, forecast_hour_beginning_ept, forecast_area |
| Promoted | hrl_load_metered | Hourly Load: Metered | none | none | Daily | Indefinitely | datetime_beginning_utc, nerc_region, mkt_region, zone, load_area, is_verified |
| Promoted | hrl_load_prelim | Hourly Load: Preliminary | none | none | Daily | Indefinitely | datetime_beginning_utc, load_area |
| Promoted | hrl_dmd_bids | Hourly Demand Bid Data | none | none | Daily | Indefinitely | datetime_beginning_utc, datetime_beginning_ept, area |
| Queued | instantaneous_wind_gen | Instantaneous Wind Generation | instantaneous_wind_gen | instantaneous_wind_gen_v1_2026_apr_28 | Every 15 seconds | 30 days | datetime_beginning_utc |
| Promoted | frcstd_gen_outages | Forecasted Generation Outages | none | none | Daily | Indefinitely | forecast_execution_date_ept, forecast_date |
| Queued | operational_reserves | Operational Reserves | operational_reserves | operational_reserves | Every 15 seconds | 15 days | datetime_beginning_utc, datetime_beginning_ept, reserve_name |
| Promoted | rt_dispatch_reserves | Real-Time Dispatched Reserves | none | none | Daily On Business Days | Indefinitely | mkt_day, datetime_beginning_utc, datetime_beginning_ept, area, reserve_type |
| Promoted | reserve_market_results | Real-Time Ancillary Service Market Results | none | none | Daily on Business Days | Indefinitely | datetime_beginning_utc, locale, service |
| Promoted | rt_default_mv_override | Real-Time Default Marginal Value Override | none | none | Daily | Indefinitely | constraint_name, contingency_description, effective_day |
| Promoted | rt_marginal_value | Real-Time Marginal Value | none | none | Daily on Business Days | Indefinitely | datetime_beginning_utc, monitored_facility, contingency_facility |
| Promoted | rt_short_term_mv_override | Real-Time Short-Term Marginal Value Override | none | none | Hourly | 7 years | constraint_name, contingency_description, effective_datetime_utc |
| Promoted | rt_unverified_hrl_lmps | Real-Time Unverified Hourly LMPs | none | none | Hourly | 30 days | datetime_beginning_utc, pnode_name, type |
| Promoted | load_frcstd_7_day | Seven-Day Load Forecast | none | none | Hourly | None | evaluated_at_datetime_utc, forecast_datetime_beginning_utc, forecast_area |
| Promoted | ops_sum_frcstd_tran_lim | Operations Summary - Forecast Transfer Limits | none | none | Hourly | Indefinitely | projected_peak_datetime_utc, transfer_limit_name |
| Promoted | ops_sum_frcst_peak_area | Operations Summary - Projected Area Statistics at Peak | none | none | Daily | Indefinitely | projected_peak_datetime_utc, area |
| Promoted | ops_sum_frcst_peak_rto | Operations Summary - Projected RTO Statistics at Peak | none | none | Daily | Indefinitely | projected_peak_datetime_utc, area |
| Promoted | ops_sum_prev_period | Operations Summary - Actual Operational Statistics | none | none | Daily | Indefinitely | datetime_beginning_utc, area |
| Promoted | ops_sum_prjctd_tie_flow | Operations Summary - Projected Scheduled Tie Flow | none | none | Daily | Indefinitely | projected_peak_datetime_utc, interface |
| Promoted | gen_outages_by_type | Generation Outage for Seven Days by Type | none | none | Daily | Indefinitely | forecast_execution_date_ept, forecast_date, region |
| Promoted | solar_gen | Solar Generation | none | none | Daily | Indefinitely | datetime_beginning_utc, area |
| Promoted | wind_gen | Wind Generation | none | none | Daily | Indefinitely | datetime_beginning_utc, area |

## Current Promoted Contracts

### pnode

- Source system: PJM Data Miner 2 `pnode`.
- Destination: `pjm.pnode`.
- Runtime scope: active pricing nodes where `termination_date` is
  `12/31/9999 exact` in PJM Data Miner 2.
- Grain: one current active row per pricing node ID.
- Uniqueness key: `pnode_id`.
- Freshness field: `effective_date` and `termination_date`.
- Runtime: `backend.scrapes.power.pjm.pnode`.
- dbt folder:
  `dbt/azure_postgres/models/power/pjm/pnode/`.
- Manual table DDL:
  `dbt/azure_postgres/models/power/pjm/pnode/table_pjm_pnode.sql`.

### da_hrl_lmps

- Source system: PJM Data Miner 2 `da_hrl_lmps`.
- Destination: `pjm.da_hrl_lmps`.
- Grain: one row per UTC hour, pricing node, current/version flag, and version
  number.
- Uniqueness key: `datetime_beginning_utc`, `pnode_id`, `pnode_name`,
  `row_is_current`, `version_nbr`.
- Freshness field: `datetime_beginning_utc` and `datetime_beginning_ept`.
- Scheduled orchestration: `backend.orchestration.power.pjm.da_hrl_lmps`.
- Lower-level scrape module: `backend.scrapes.power.pjm.da_hrl_lmps`.
- VM timer: `helios-da-hrl-lmps.timer`.
- Runtime observability: `ops.api_fetch_log`.
- Data availability output: `ops.data_availability_events` with event keys in
  the shape `pjm_da_hrl_lmps:data_ready:<YYYY-MM-DD>:hub`.
- dbt folder: `dbt/azure_postgres/models/power/pjm/da_hrl_lmps/`.
- Manual table DDL:
  `dbt/azure_postgres/models/power/pjm/da_hrl_lmps/table_pjm_da_hrl_lmps.sql`.

### rt_hrl_lmps

- Source system: PJM Data Miner 2 `rt_hrl_lmps`.
- Destination: `pjm.rt_hrl_lmps`.
- Grain: one row per UTC hour, pricing node, current/version flag, and version
  number.
- Uniqueness key: `datetime_beginning_utc`, `pnode_id`, `pnode_name`,
  `row_is_current`, `version_nbr`.
- Freshness field: `datetime_beginning_utc` and `datetime_beginning_ept`.
- Scheduled orchestration: `backend.orchestration.power.pjm.rt_hrl_lmps`,
  starting on business days at 11:30 a.m. EPT and polling every 5 minutes for
  up to 5 hours until PJM's verified hourly RT posting is available.
- Lower-level scrape module: `backend.scrapes.power.pjm.rt_hrl_lmps`.
- dbt folder: `dbt/azure_postgres/models/power/pjm/rt_hrl_lmps/`.
- Manual table DDL:
  `dbt/azure_postgres/models/power/pjm/rt_hrl_lmps/table_pjm_rt_hrl_lmps.sql`.

### unverified_five_min_lmps

- Source system: PJM Data Miner 2 `unverified_five_min_lmps`.
- Destination: `pjm.unverified_five_min_lmps`.
- Grain: one row per five-minute UTC/EPT interval, pricing node name, and
  pricing node type.
- Uniqueness key: `datetime_beginning_utc`, `datetime_beginning_ept`, `name`,
  `type`.
- Freshness field: `datetime_beginning_utc` and `datetime_beginning_ept`.
- Runtime: `backend.scrapes.power.pjm.unverified_five_min_lmps`.
- dbt folder:
  `dbt/azure_postgres/models/power/pjm/unverified_five_min_lmps/`.
- Manual table DDL:
  `dbt/azure_postgres/models/power/pjm/unverified_five_min_lmps/table_pjm_unverified_five_min_lmps.sql`.

### rt_fivemin_mnt_lmps

- Source system: PJM Data Miner 2 `rt_fivemin_mnt_lmps`.
- Destination: `pjm.rt_fivemin_mnt_lmps`.
- Grain: one row per five-minute UTC interval and pricing node.
- Uniqueness key: `datetime_beginning_utc`, `pnode_id`, `pnode_name`.
- Freshness field: `datetime_beginning_utc` and `datetime_beginning_ept`.
- Runtime: `backend.scrapes.power.pjm.rt_fivemin_mnt_lmps`.
- dbt folder:
  `dbt/azure_postgres/models/power/pjm/rt_fivemin_mnt_lmps/`.
- Manual table DDL:
  `dbt/azure_postgres/models/power/pjm/rt_fivemin_mnt_lmps/table_pjm_rt_fivemin_mnt_lmps.sql`.

### rt_fivemin_hrl_lmps

- Source system: PJM Data Miner 2 `rt_fivemin_hrl_lmps`.
- Destination: `pjm.rt_fivemin_hrl_lmps`.
- Grain: one current row per five-minute UTC interval and pricing node.
- Runtime scope: current `hub`, `zone`, and `interface` pricing-node types.
- Runtime filter: PJM does not allow `type` as an API filter for this feed, so
  the scrape resolves active hub, zone, and interface `pnode_id` values from
  the `pnode` feed and queries `rt_fivemin_hrl_lmps` by `pnode_id` batches.
- Uniqueness key: `datetime_beginning_utc`, `pnode_id`, `pnode_name`.
- Freshness field: `datetime_beginning_utc` and `datetime_beginning_ept`.
- Scheduled orchestration:
  `backend.orchestration.power.pjm.rt_fivemin_hrl_lmps`.
- Lower-level scrape module: `backend.scrapes.power.pjm.rt_fivemin_hrl_lmps`.
- VM timer: `helios-rt-fivemin-hrl-lmps.timer`.
- Runtime observability: `ops.api_fetch_log`.
- Data availability output: `ops.data_availability_events` with event keys in
  the shape
  `pjm_rt_fivemin_hrl_lmps:data_ready:<YYYY-MM-DD>:hub_zone_interface`.
- dbt folder:
  `dbt/azure_postgres/models/power/pjm/rt_fivemin_hrl_lmps/`.
- Manual table DDL:
  `dbt/azure_postgres/models/power/pjm/rt_fivemin_hrl_lmps/table_pjm_rt_fivemin_hrl_lmps.sql`.

### five_min_tie_flows

- Source system: PJM Data Miner 2 `five_min_tie_flows`.
- Destination: `pjm.five_min_tie_flows`.
- Grain: one row per five-minute UTC/EPT interval and tie flow name.
- Uniqueness key: `datetime_beginning_utc`, `datetime_beginning_ept`,
  `tie_flow_name`.
- Freshness field: `datetime_beginning_utc` and `datetime_beginning_ept`.
- Runtime: `backend.scrapes.power.pjm.five_min_tie_flows`.
- dbt folder:
  `dbt/azure_postgres/models/power/pjm/five_min_tie_flows/`.
- Manual table DDL:
  `dbt/azure_postgres/models/power/pjm/five_min_tie_flows/table_pjm_five_min_tie_flows.sql`.

### act_sch_interchange

- Source system: PJM Data Miner 2 `act_sch_interchange`.
- Destination: `pjm.act_sch_interchange`.
- Grain: source contract from PJM Data Miner 2 metadata; primary key `datetime_beginning_utc, tie_line`.
- Uniqueness key: `datetime_beginning_utc, tie_line`.
- Freshness field: `datetime_beginning_ept`.
- Runtime: `backend.scrapes.power.pjm.act_sch_interchange`.
- dbt folder:
  `dbt/azure_postgres/models/power/pjm/act_sch_interchange/`.
- Manual table DDL:
  `dbt/azure_postgres/models/power/pjm/act_sch_interchange/table_pjm_act_sch_interchange.sql`.

### agg_definitions

- Source system: PJM Data Miner 2 `agg_definitions`.
- Destination: `pjm.agg_definitions`.
- Runtime scope: active aggregate definitions where `terminate_date_ept` is
  `12/31/9999 exact` in PJM Data Miner 2.
- Grain: one active aggregate pricing node, bus pricing node, and effective
  date.
- Uniqueness key: `agg_pnode_id, bus_pnode_id, effective_date_ept`.
- Freshness field: `effective_date_ept` and `terminate_date_ept`.
- Data type note: `agg_pnode_id` and `bus_pnode_id` require `BIGINT`; the
  current PJM sample includes IDs above signed 32-bit integer range.
- Runtime: `backend.scrapes.power.pjm.agg_definitions`.
- dbt folder:
  `dbt/azure_postgres/models/power/pjm/agg_definitions/`.
- Manual table DDL:
  `dbt/azure_postgres/models/power/pjm/agg_definitions/table_pjm_agg_definitions.sql`.

### ancillary_services

- Source system: PJM Data Miner 2 `ancillary_services`.
- Destination: `pjm.ancillary_services`.
- Grain: source contract from PJM Data Miner 2 metadata; primary key `datetime_beginning_utc, datetime_beginning_ept, ancillary_service, row_is_current, version_nbr`.
- Uniqueness key: `datetime_beginning_utc, datetime_beginning_ept, ancillary_service, row_is_current, version_nbr`.
- Freshness field: `datetime_beginning_ept`.
- Runtime: `backend.scrapes.power.pjm.ancillary_services`.
- dbt folder:
  `dbt/azure_postgres/models/power/pjm/ancillary_services/`.
- Manual table DDL:
  `dbt/azure_postgres/models/power/pjm/ancillary_services/table_pjm_ancillary_services.sql`.

### da_interface_flows_and_limits

- Source system: PJM Data Miner 2 `da_interface_flows_and_limits`.
- Destination: `pjm.da_interface_flows_and_limits`.
- Grain: source contract from PJM Data Miner 2 metadata; primary key `datetime_beginning_utc, interface_limit_name`.
- Uniqueness key: `datetime_beginning_utc, interface_limit_name`.
- Freshness field: `datetime_beginning_ept`.
- Runtime: `backend.scrapes.power.pjm.da_interface_flows_and_limits`.
- dbt folder:
  `dbt/azure_postgres/models/power/pjm/da_interface_flows_and_limits/`.
- Manual table DDL:
  `dbt/azure_postgres/models/power/pjm/da_interface_flows_and_limits/table_pjm_da_interface_flows_and_limits.sql`.

### da_marginal_value

- Source system: PJM Data Miner 2 `da_marginal_value`.
- Destination: `pjm.da_marginal_value`.
- Grain: source contract from PJM Data Miner 2 metadata; primary key `datetime_beginning_utc, monitored_facility, contingency_facility`.
- Uniqueness key: `datetime_beginning_utc, monitored_facility, contingency_facility`.
- Freshness field: `datetime_beginning_ept`.
- Runtime: `backend.scrapes.power.pjm.da_marginal_value`.
- dbt folder:
  `dbt/azure_postgres/models/power/pjm/da_marginal_value/`.
- Manual table DDL:
  `dbt/azure_postgres/models/power/pjm/da_marginal_value/table_pjm_da_marginal_value.sql`.

### da_transconstraints

- Source system: PJM Data Miner 2 `da_transconstraints`.
- Destination: `pjm.da_transconstraints`.
- Grain: source contract from PJM Data Miner 2 metadata; primary key `datetime_beginning_utc, day_ahead_congestion_event, monitored_facility, contingency_facility`.
- Uniqueness key: `datetime_beginning_utc, day_ahead_congestion_event, monitored_facility, contingency_facility`.
- Freshness field: `datetime_beginning_ept`.
- Runtime: `backend.scrapes.power.pjm.da_transconstraints`.
- dbt folder:
  `dbt/azure_postgres/models/power/pjm/da_transconstraints/`.
- Manual table DDL:
  `dbt/azure_postgres/models/power/pjm/da_transconstraints/table_pjm_da_transconstraints.sql`.

### day_gen_capacity

- Source system: PJM Data Miner 2 `day_gen_capacity`.
- Destination: `pjm.day_gen_capacity`.
- Grain: source contract from PJM Data Miner 2 metadata; primary key `bid_datetime_beginning_utc`.
- Uniqueness key: `bid_datetime_beginning_utc`.
- Freshness field: `bid_datetime_beginning_ept`.
- Runtime: `backend.scrapes.power.pjm.day_gen_capacity`.
- dbt folder:
  `dbt/azure_postgres/models/power/pjm/day_gen_capacity/`.
- Manual table DDL:
  `dbt/azure_postgres/models/power/pjm/day_gen_capacity/table_pjm_day_gen_capacity.sql`.

### dispatched_reserves

- Source system: PJM Data Miner 2 `dispatched_reserves`.
- Destination: `pjm.dispatched_reserves`.
- Grain: source contract from PJM Data Miner 2 metadata; primary key `datetime_beginning_utc, datetime_beginning_ept, area, reserve_type`.
- Uniqueness key: `datetime_beginning_utc, datetime_beginning_ept, area, reserve_type`.
- Freshness field: `datetime_beginning_ept`.
- Runtime: `backend.scrapes.power.pjm.dispatched_reserves`.
- dbt folder:
  `dbt/azure_postgres/models/power/pjm/dispatched_reserves/`.
- Manual table DDL:
  `dbt/azure_postgres/models/power/pjm/dispatched_reserves/table_pjm_dispatched_reserves.sql`.

### five_min_solar_generation

- Source system: PJM Data Miner 2 `five_min_solar_generation`.
- Destination: `pjm.five_min_solar_generation`.
- Grain: source contract from PJM Data Miner 2 metadata; primary key `datetime_beginning_utc`.
- Uniqueness key: `datetime_beginning_utc`.
- Freshness field: `datetime_beginning_ept`.
- Runtime: `backend.scrapes.power.pjm.five_min_solar_generation`.
- dbt folder:
  `dbt/azure_postgres/models/power/pjm/five_min_solar_generation/`.
- Manual table DDL:
  `dbt/azure_postgres/models/power/pjm/five_min_solar_generation/table_pjm_five_min_solar_generation.sql`.

### gen_by_fuel

- Source system: PJM Data Miner 2 `gen_by_fuel`.
- Destination: `pjm.gen_by_fuel`.
- Grain: source contract from PJM Data Miner 2 metadata; primary key `datetime_beginning_utc, fuel_type`.
- Uniqueness key: `datetime_beginning_utc, fuel_type`.
- Freshness field: `datetime_beginning_ept`.
- Runtime: `backend.scrapes.power.pjm.gen_by_fuel`.
- dbt folder:
  `dbt/azure_postgres/models/power/pjm/gen_by_fuel/`.
- Manual table DDL:
  `dbt/azure_postgres/models/power/pjm/gen_by_fuel/table_pjm_gen_by_fuel.sql`.

### rt_and_self_ecomax

- Source system: PJM Data Miner 2 `rt_and_self_ecomax`.
- Destination: `pjm.rt_and_self_ecomax`.
- Grain: source contract from PJM Data Miner 2 metadata; primary key `datetime_beginning_utc`.
- Uniqueness key: `datetime_beginning_utc`.
- Freshness field: `datetime_beginning_ept`.
- Runtime: `backend.scrapes.power.pjm.rt_and_self_ecomax`.
- dbt folder:
  `dbt/azure_postgres/models/power/pjm/rt_and_self_ecomax/`.
- Manual table DDL:
  `dbt/azure_postgres/models/power/pjm/rt_and_self_ecomax/table_pjm_rt_and_self_ecomax.sql`.

### load_frcstd_hist

- Source system: PJM Data Miner 2 `load_frcstd_hist`.
- Destination: `pjm.load_frcstd_hist`.
- Grain: source contract from PJM Data Miner 2 metadata; primary key `evaluated_at_utc, evaluated_at_ept, forecast_hour_beginning_utc, forecast_hour_beginning_ept, forecast_area`.
- Uniqueness key: `evaluated_at_utc, evaluated_at_ept, forecast_hour_beginning_utc, forecast_hour_beginning_ept, forecast_area`.
- Freshness field: `forecast_hour_beginning_ept`.
- Runtime: `backend.scrapes.power.pjm.load_frcstd_hist`.
- dbt folder:
  `dbt/azure_postgres/models/power/pjm/load_frcstd_hist/`.
- Manual table DDL:
  `dbt/azure_postgres/models/power/pjm/load_frcstd_hist/table_pjm_load_frcstd_hist.sql`.

### hrl_load_metered

- Source system: PJM Data Miner 2 `hrl_load_metered`.
- Destination: `pjm.hrl_load_metered`.
- Grain: source contract from PJM Data Miner 2 metadata; primary key `datetime_beginning_utc, nerc_region, mkt_region, zone, load_area, is_verified`.
- Uniqueness key: `datetime_beginning_utc, nerc_region, mkt_region, zone, load_area, is_verified`.
- Freshness field: `datetime_beginning_ept`.
- Runtime: `backend.scrapes.power.pjm.hrl_load_metered`.
- dbt folder:
  `dbt/azure_postgres/models/power/pjm/hrl_load_metered/`.
- Manual table DDL:
  `dbt/azure_postgres/models/power/pjm/hrl_load_metered/table_pjm_hrl_load_metered.sql`.

### hrl_load_prelim

- Source system: PJM Data Miner 2 `hrl_load_prelim`.
- Destination: `pjm.hrl_load_prelim`.
- Grain: source contract from PJM Data Miner 2 metadata; primary key `datetime_beginning_utc, load_area`.
- Uniqueness key: `datetime_beginning_utc, load_area`.
- Freshness field: `datetime_beginning_ept`.
- Runtime: `backend.scrapes.power.pjm.hrl_load_prelim`.
- dbt folder:
  `dbt/azure_postgres/models/power/pjm/hrl_load_prelim/`.
- Manual table DDL:
  `dbt/azure_postgres/models/power/pjm/hrl_load_prelim/table_pjm_hrl_load_prelim.sql`.

### hrl_dmd_bids

- Source system: PJM Data Miner 2 `hrl_dmd_bids`.
- Destination: `pjm.hrl_dmd_bids`.
- Grain: source contract from PJM Data Miner 2 metadata; primary key `datetime_beginning_utc, datetime_beginning_ept, area`.
- Uniqueness key: `datetime_beginning_utc, datetime_beginning_ept, area`.
- Freshness field: `datetime_beginning_ept`.
- Runtime: `backend.orchestration.power.pjm.hrl_dmd_bids` for the scheduled
  publication-aware refresh; `backend.scrapes.power.pjm.hrl_dmd_bids` remains
  the lower-level scrape module.
- dbt folder:
  `dbt/azure_postgres/models/power/pjm/hrl_dmd_bids/`.
- Manual table DDL:
  `dbt/azure_postgres/models/power/pjm/hrl_dmd_bids/table_pjm_hrl_dmd_bids.sql`.

### frcstd_gen_outages

- Source system: PJM Data Miner 2 `frcstd_gen_outages`.
- Destination: `pjm.frcstd_gen_outages`.
- Grain: source contract from PJM Data Miner 2 metadata; primary key `forecast_execution_date_ept, forecast_date`.
- Uniqueness key: `forecast_execution_date_ept, forecast_date`.
- Freshness field: `forecast_execution_date_ept`.
- Runtime: `backend.scrapes.power.pjm.frcstd_gen_outages`.
- dbt folder:
  `dbt/azure_postgres/models/power/pjm/frcstd_gen_outages/`.
- Manual table DDL:
  `dbt/azure_postgres/models/power/pjm/frcstd_gen_outages/table_pjm_frcstd_gen_outages.sql`.

### rt_dispatch_reserves

- Source system: PJM Data Miner 2 `rt_dispatch_reserves`.
- Destination: `pjm.rt_dispatch_reserves`.
- Grain: source contract from PJM Data Miner 2 metadata; primary key `mkt_day, datetime_beginning_utc, datetime_beginning_ept, area, reserve_type`.
- Uniqueness key: `mkt_day, datetime_beginning_utc, datetime_beginning_ept, area, reserve_type`.
- Freshness field: `datetime_beginning_ept`.
- Runtime: `backend.scrapes.power.pjm.rt_dispatch_reserves`.
- dbt folder:
  `dbt/azure_postgres/models/power/pjm/rt_dispatch_reserves/`.
- Manual table DDL:
  `dbt/azure_postgres/models/power/pjm/rt_dispatch_reserves/table_pjm_rt_dispatch_reserves.sql`.

### reserve_market_results

- Source system: PJM Data Miner 2 `reserve_market_results`.
- Destination: `pjm.reserve_market_results`.
- Grain: source contract from PJM Data Miner 2 metadata; primary key `datetime_beginning_utc, locale, service`.
- Uniqueness key: `datetime_beginning_utc, locale, service`.
- Freshness field: `datetime_beginning_ept`.
- Runtime: `backend.scrapes.power.pjm.reserve_market_results`.
- dbt folder:
  `dbt/azure_postgres/models/power/pjm/reserve_market_results/`.
- Manual table DDL:
  `dbt/azure_postgres/models/power/pjm/reserve_market_results/table_pjm_reserve_market_results.sql`.

### rt_default_mv_override

- Source system: PJM Data Miner 2 `rt_default_mv_override`.
- Destination: `pjm.rt_default_mv_override`.
- Grain: source contract from PJM Data Miner 2 metadata; primary key `constraint_name, contingency_description, effective_day`.
- Uniqueness key: `constraint_name, contingency_description, effective_day`.
- Freshness field: `posted_day`.
- Runtime: `backend.scrapes.power.pjm.rt_default_mv_override`.
- dbt folder:
  `dbt/azure_postgres/models/power/pjm/rt_default_mv_override/`.
- Manual table DDL:
  `dbt/azure_postgres/models/power/pjm/rt_default_mv_override/table_pjm_rt_default_mv_override.sql`.

### rt_marginal_value

- Source system: PJM Data Miner 2 `rt_marginal_value`.
- Destination: `pjm.rt_marginal_value`.
- Grain: source contract from PJM Data Miner 2 metadata; primary key `datetime_beginning_utc, monitored_facility, contingency_facility`.
- Uniqueness key: `datetime_beginning_utc, monitored_facility, contingency_facility`.
- Freshness field: `datetime_beginning_ept`.
- Runtime: `backend.scrapes.power.pjm.rt_marginal_value`.
- dbt folder:
  `dbt/azure_postgres/models/power/pjm/rt_marginal_value/`.
- Manual table DDL:
  `dbt/azure_postgres/models/power/pjm/rt_marginal_value/table_pjm_rt_marginal_value.sql`.

### rt_short_term_mv_override

- Source system: PJM Data Miner 2 `rt_short_term_mv_override`.
- Destination: `pjm.rt_short_term_mv_override`.
- Grain: source contract from PJM Data Miner 2 metadata; primary key `constraint_name, contingency_description, effective_datetime_utc`.
- Uniqueness key: `constraint_name, contingency_description, effective_datetime_utc`.
- Freshness field: `posted_day`.
- Runtime: `backend.scrapes.power.pjm.rt_short_term_mv_override`.
- dbt folder:
  `dbt/azure_postgres/models/power/pjm/rt_short_term_mv_override/`.
- Manual table DDL:
  `dbt/azure_postgres/models/power/pjm/rt_short_term_mv_override/table_pjm_rt_short_term_mv_override.sql`.

### rt_unverified_hrl_lmps

- Source system: PJM Data Miner 2 `rt_unverified_hrl_lmps`.
- Destination: `pjm.rt_unverified_hrl_lmps`.
- Runtime scope: current `hub`, `zone`, and `interface` pricing-node types.
- Grain: one hourly UTC/EPT interval, pricing node name, and pricing-node
  type.
- Uniqueness key: `datetime_beginning_utc, pnode_name, type`.
- Freshness field: `datetime_beginning_utc` and `datetime_beginning_ept`.
- Data shape note: PJM publishes total, congestion, and marginal-loss RT
  components. The dbt source model derives system energy as total minus
  congestion minus marginal loss for consistency with verified LMP models.
- Verification note: live PJM sample on 2026-06-12 returned 29,110 rows across
  hub, zone, and interface filters with no duplicate uniqueness keys.
- Runtime: `backend.scrapes.power.pjm.rt_unverified_hrl_lmps`.
- Scheduled orchestration:
  `backend.orchestration.power.pjm.hourly_bucket`, hourly at minute `15` UTC
  through `helios-pjm-hourly-bucket.timer`; the bucket currently calls
  `backend.orchestration.power.pjm.rt_unverified_hrl_lmps`.
- Runtime observability: `ops.api_fetch_log`.
- Repair path: `backend.orchestration.power.pjm.hourly_price_backfill_7_day`
  reruns recent unverified hourly RT LMP market dates nightly.
- dbt folder:
  `dbt/azure_postgres/models/power/pjm/rt_unverified_hrl_lmps/`.
- Manual table DDL:
  `dbt/azure_postgres/models/power/pjm/rt_unverified_hrl_lmps/table_pjm_rt_unverified_hrl_lmps.sql`.

### load_frcstd_7_day

- Source system: PJM Data Miner 2 `load_frcstd_7_day`.
- Destination: `pjm.load_frcstd_7_day`.
- Grain: source contract from PJM Data Miner 2 metadata; primary key `evaluated_at_datetime_utc, forecast_datetime_beginning_utc, forecast_area`.
- Uniqueness key: `evaluated_at_datetime_utc, forecast_datetime_beginning_utc, forecast_area`.
- Freshness field: `evaluated_at_datetime_utc`.
- Runtime: `backend.scrapes.power.pjm.load_frcstd_7_day`.
- dbt folder:
  `dbt/azure_postgres/models/power/pjm/load_frcstd_7_day/`.
- Manual table DDL:
  `dbt/azure_postgres/models/power/pjm/load_frcstd_7_day/table_pjm_load_frcstd_7_day.sql`.

### gen_outages_by_type

- Source system: PJM Data Miner 2 `gen_outages_by_type`.
- Destination: `pjm.gen_outages_by_type`.
- Grain: source contract from PJM Data Miner 2 metadata; primary key `forecast_execution_date_ept, forecast_date, region`.
- Uniqueness key: `forecast_execution_date_ept, forecast_date, region`.
- Freshness field: `forecast_execution_date_ept`.
- Runtime: `backend.scrapes.power.pjm.gen_outages_by_type`.
- dbt folder:
  `dbt/azure_postgres/models/power/pjm/gen_outages_by_type/`.
- Manual table DDL:
  `dbt/azure_postgres/models/power/pjm/gen_outages_by_type/table_pjm_gen_outages_by_type.sql`.

### solar_gen

- Source system: PJM Data Miner 2 `solar_gen`.
- Destination: `pjm.solar_gen`.
- Grain: source contract from PJM Data Miner 2 metadata; primary key `datetime_beginning_utc, area`.
- Uniqueness key: `datetime_beginning_utc, area`.
- Freshness field: `datetime_beginning_ept`.
- Runtime: `backend.scrapes.power.pjm.solar_gen`.
- dbt folder:
  `dbt/azure_postgres/models/power/pjm/solar_gen/`.
- Manual table DDL:
  `dbt/azure_postgres/models/power/pjm/solar_gen/table_pjm_solar_gen.sql`.

### wind_gen

- Source system: PJM Data Miner 2 `wind_gen`.
- Destination: `pjm.wind_gen`.
- Grain: source contract from PJM Data Miner 2 metadata; primary key `datetime_beginning_utc, area`.
- Uniqueness key: `datetime_beginning_utc, area`.
- Freshness field: `datetime_beginning_ept`.
- Runtime: `backend.scrapes.power.pjm.wind_gen`.
- dbt folder:
  `dbt/azure_postgres/models/power/pjm/wind_gen/`.
- Manual table DDL:
  `dbt/azure_postgres/models/power/pjm/wind_gen/table_pjm_wind_gen.sql`.

### ops_sum_frcstd_tran_lim

- Source system: PJM Data Miner 2 `ops_sum_frcstd_tran_lim`.
- Destination: `pjm.ops_sum_frcstd_tran_lim`.
- Grain: one projected peak and transfer-limit name.
- Uniqueness key:
  `projected_peak_datetime_utc, transfer_limit_name`.
- Freshness field: `generated_at_ept` and `projected_peak_datetime_ept`.
- Runtime: `backend.scrapes.power.pjm.ops_sum_frcstd_tran_lim`.
- Scheduled orchestration: `backend.orchestration.power.pjm.ops_sum`.
- dbt folder:
  `dbt/azure_postgres/models/power/pjm/ops_sum_frcstd_tran_lim/`.
- Manual table DDL:
  `dbt/azure_postgres/models/power/pjm/ops_sum_frcstd_tran_lim/table_pjm_ops_sum_frcstd_tran_lim.sql`.

### ops_sum_frcst_peak_area

- Source system: PJM Data Miner 2 `ops_sum_frcst_peak_area`.
- Destination: `pjm.ops_sum_frcst_peak_area`.
- Grain: one projected peak and area.
- Uniqueness key:
  `projected_peak_datetime_utc, area`.
- Freshness field: `generated_at_ept` and `projected_peak_datetime_ept`.
- Runtime: `backend.scrapes.power.pjm.ops_sum_frcst_peak_area`.
- Scheduled orchestration: `backend.orchestration.power.pjm.ops_sum`.
- dbt folder:
  `dbt/azure_postgres/models/power/pjm/ops_sum_frcst_peak_area/`.
- Manual table DDL:
  `dbt/azure_postgres/models/power/pjm/ops_sum_frcst_peak_area/table_pjm_ops_sum_frcst_peak_area.sql`.

### ops_sum_frcst_peak_rto

- Source system: PJM Data Miner 2 `ops_sum_frcst_peak_rto`.
- Destination: `pjm.ops_sum_frcst_peak_rto`.
- Grain: one projected peak and RTO area row.
- Uniqueness key:
  `projected_peak_datetime_utc, area`.
- Freshness field: `generated_at_ept` and `projected_peak_datetime_ept`.
- Runtime: `backend.scrapes.power.pjm.ops_sum_frcst_peak_rto`.
- Scheduled orchestration: `backend.orchestration.power.pjm.ops_sum`.
- dbt folder:
  `dbt/azure_postgres/models/power/pjm/ops_sum_frcst_peak_rto/`.
- Manual table DDL:
  `dbt/azure_postgres/models/power/pjm/ops_sum_frcst_peak_rto/table_pjm_ops_sum_frcst_peak_rto.sql`.

### ops_sum_prev_period

- Source system: PJM Data Miner 2 `ops_sum_prev_period`.
- Destination: `pjm.ops_sum_prev_period`.
- Grain: one operating hour and area.
- Uniqueness key:
  `datetime_beginning_utc, area`.
- Freshness field: `generated_at_ept` and `datetime_beginning_ept`.
- Historical shape note: source rows are sparse peak/valley history before
  `2017-05-31`; complete hourly-by-area rows begin `2017-05-31`.
- Runtime: `backend.scrapes.power.pjm.ops_sum_prev_period`.
- Scheduled orchestration: `backend.orchestration.power.pjm.ops_sum`.
- dbt folder:
  `dbt/azure_postgres/models/power/pjm/ops_sum_prev_period/`.
- Manual table DDL:
  `dbt/azure_postgres/models/power/pjm/ops_sum_prev_period/table_pjm_ops_sum_prev_period.sql`.

### ops_sum_prjctd_tie_flow

- Source system: PJM Data Miner 2 `ops_sum_prjctd_tie_flow`.
- Destination: `pjm.ops_sum_prjctd_tie_flow`.
- Grain: one projected peak and interface.
- Uniqueness key:
  `projected_peak_datetime_utc, interface`.
- Freshness field: `generated_at_ept` and `projected_peak_datetime_ept`.
- Runtime: `backend.scrapes.power.pjm.ops_sum_prjctd_tie_flow`.
- Scheduled orchestration: `backend.orchestration.power.pjm.ops_sum`.
- dbt folder:
  `dbt/azure_postgres/models/power/pjm/ops_sum_prjctd_tie_flow/`.
- Manual table DDL:
  `dbt/azure_postgres/models/power/pjm/ops_sum_prjctd_tie_flow/table_pjm_ops_sum_prjctd_tie_flow.sql`.
