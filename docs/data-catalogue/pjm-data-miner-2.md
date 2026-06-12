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
- Destination schema is `pjm`.
- Runtime writes use the backend `helios_admin` path and upsert into direct
  tables documented by disabled dbt `table_*.sql` operator SQL.
- dbt models are read-only validation and query shaping under
  `dbt/azure_postgres/models/power/pjm/<feed_short_name>/`.
- Backfills are out of scope for the initial migration pass unless explicitly
  requested.

## Promotion Queue

| Status | PJM feed/table name | Display name | Legacy module | Legacy target | Posting | Retention | Primary key for upsert |
|---|---|---|---|---|---|---|---|
| Promoted | da_hrl_lmps | Day-Ahead Hourly LMPs | da_hrl_lmps | da_hrl_lmps | Daily | Indefinitely | datetime_beginning_utc, pnode_id, pnode_name, row_is_current, version_nbr |
| Promoted | rt_hrl_lmps | Real-Time Hourly LMPs | rt_hrl_lmps | rt_settlements_verified_hourly_lmps | Daily on Business Days | Indefinitely | datetime_beginning_utc, pnode_id, pnode_name, row_is_current, version_nbr |
| Promoted | unverified_five_min_lmps | Unverified Five Minute LMPs | unverified_five_min_lmps | unverified_five_min_lmps | Every 5 minutes | 30 days | datetime_beginning_utc, datetime_beginning_ept, name, type |
| Promoted | rt_fivemin_mnt_lmps | Settlements Verified Five Minute LMPs | none | none | Daily on Business Days | Indefinitely | datetime_beginning_utc, pnode_id, pnode_name |
| Queued | act_sch_interchange | Actual/Schedule Summary Report | act_sch_interchange | act_sch_interchange | Weekly | Indefinitely | datetime_beginning_utc, tie_line |
| Queued | agg_definitions | Fixed Weighted Average Aggregate Definitions | agg_definitions | agg_definitions | Daily | Indefinitely | agg_pnode_id, bus_pnode_id, effective_date_ept |
| Queued | ancillary_services | Real-Time Ancillary Service Hourly LMPs | ancillary_services | ancillary_services | Daily on business days | Indefinitely | datetime_beginning_utc, datetime_beginning_ept, ancillary_service |
| Queued | da_interface_flows_and_limits | Day Ahead Interface Flows and Limits | da_interface_flows_and_limits | da_interface_flows_and_limits | Daily | Indefinitely | datetime_beginning_utc, interface_limit_name |
| Queued | da_marginal_value | Day-Ahead Marginal Value | da_marginal_value | da_marginal_value | Daily | Indefinitely | datetime_beginning_utc, monitored_facility, contingency_facility |
| Queued | da_transconstraints | Day-Ahead Transmission Constraints | da_transmission_constraints | da_transmission_constraints | Daily | Indefinitely | datetime_beginning_utc, day_ahead_congestion_event, monitored_facility, contingency_facility |
| Queued | day_gen_capacity | Daily Generation Capacity | day_gen_capacity | day_gen_capacity | Daily | Indefinitely | bid_datetime_beginning_utc |
| Queued | dispatched_reserves | Dispatched Reserves | dispatched_reserves | dispatched_reserves | Every 5 minutes | 30 days | datetime_beginning_utc, datetime_beginning_ept, area, reserve_type |
| Queued | inst_load | Instantaneous Load | five_min_instantaneous_load | five_min_instantaneous_load_v1_2025_oct_15 | Every 5 minutes | 30 days | datetime_beginning_utc, datetime_beginning_ept, area |
| Queued | five_min_solar_generation | Five Minute Solar Generation | five_min_solar_generation | five_min_solar_generation_v1_2026_apr_28 | Every 5 minutes | 30 days | datetime_beginning_utc |
| Queued | five_min_tie_flows | Five Minute Tie Flows | five_min_tie_flows | five_min_tie_flows | Every 5 minutes | 30 days | datetime_beginning_utc, datetime_beginning_ept, tie_flow_name |
| Queued | load_frcstd_hist | Historical Load Forecasts | historical_load_forecasts | historical_load_forecasts | Daily | Indefinitely | evaluated_at_utc, evaluated_at_ept, forecast_hour_beginning_utc, forecast_hour_beginning_ept, forecast_area |
| Queued | hrl_load_metered | Hourly Load: Metered | hourly_load_metered | hourly_load_metered | Daily | Indefinitely | datetime_beginning_utc, nerc_region, mkt_region, zone, load_area, is_verified |
| Queued | hrl_load_prelim | Hourly Load: Preliminary | hourly_load_prelim | hourly_load_prelim | Daily | Indefinitely | datetime_beginning_utc, load_area |
| Queued | hrl_dmd_bids | Hourly Demand Bid Data | hrl_dmd_bids | hrl_dmd_bids | Daily | Indefinitely | datetime_beginning_utc, datetime_beginning_ept, area |
| Queued | instantaneous_wind_gen | Instantaneous Wind Generation | instantaneous_wind_gen | instantaneous_wind_gen_v1_2026_apr_28 | Every 15 seconds | 30 days | datetime_beginning_utc |
| Queued | frcstd_gen_outages | Forecasted Generation Outages | long_term_outages | long_term_outages | Daily | Indefinitely | forecast_execution_date, forecast_date |
| Queued | operational_reserves | Operational Reserves | operational_reserves | operational_reserves | Every 15 seconds | 15 days | datetime_beginning_utc, datetime_beginning_ept, reserve_name |
| Queued | rt_dispatch_reserves | Real-Time Dispatched Reserves | real_time_dispatched_reserves | real_time_dispatched_reserves | Daily on business days | Indefinitely | mkt_day, datetime_beginning_utc, datetime_beginning_ept, area, reserve_type |
| Queued | reserve_market_results | Real-Time Ancillary Service Market Results | reserve_market_results | reserve_market_results | Daily on business days | Indefinitely | datetime_beginning_utc, locale, service |
| Queued | rt_default_mv_override | Real-Time Default Marginal Value Override | rt_default_mv_override | rt_default_mv_override | Daily | Indefinitely | constraint_name, contingency_description, effective_day |
| Queued | rt_marginal_value | Real-Time Marginal Value | rt_marginal_value | rt_marginal_value | Daily on business days | Indefinitely | datetime_beginning_utc, monitored_facility, contingency_facility |
| Queued | rt_short_term_mv_override | Real-Time Short-Term Marginal Value Override | rt_short_term_mv_override | rt_short_term_mv_override | Hourly | 7 years | constraint_name, contingency_description, effective_datetime_utc |
| Queued | rt_unverified_hrl_lmps | Real-Time Unverified Hourly LMPs | rt_unverified_hrl_lmps | rt_unverified_hourly_lmps | Hourly | 30 days | datetime_beginning_utc, pnode_name, type |
| Queued | load_frcstd_7_day | Seven-Day Load Forecast | seven_day_load_forecast_v1_2025_08_13 | seven_day_load_forecast_v1_2025_08_13 | Hourly | None | evaluated_at_datetime_utc, forecast_datetime_beginning_utc, forecast_area |
| Queued | gen_outages_by_type | Generation Outage for Seven Days by Type | seven_day_outage_forecast | seven_day_outage_forecast | Daily | Indefinitely | forecast_execution_date, forecast_date, region |
| Queued | solar_gen | Solar Generation | solar_generation_by_area | solar_generation_by_area | Daily | Indefinitely | datetime_beginning_utc, area |
| Queued | wind_gen | Wind Generation | wind_generation_by_area | wind_generation_by_area | Daily | Indefinitely | datetime_beginning_utc, area |

## Current Promoted Contracts

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
- Runtime: `backend.scrapes.power.pjm.rt_hrl_lmps`.
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
