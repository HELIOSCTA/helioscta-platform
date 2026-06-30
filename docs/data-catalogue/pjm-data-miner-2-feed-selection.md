# PJM Data Miner 2 Feed Selection

This note records which PJM Data Miner 2 feeds are worth pulling into this
project and which feeds should stay out of the first promotion wave.

Source reviewed on 2026-06-12:

- PJM Data Miner 2 UI: `https://dataminer2.pjm.com/feeds`
- PJM API base URL from the UI config: `https://api.pjm.com/api/v1`
- Active feed directory route: `GET https://api.pjm.com/api/v1/?isactive=true&startRow=1&rowCount=5000`
- Feed definition route: `GET https://api.pjm.com/api/v1/<feed_short_name>/metadata`
- Active feeds returned: 119

## Selection Rules

Promote feeds that support power-market price formation, load and generation
context, outage and transmission risk, or reference data needed to join those
datasets.

Defer feeds that are mainly credit, billing, FTR auction, uplift allocation,
settlement charge detail, retired feed history, or monthly administrative
reporting. Those can still be promoted later when a downstream consumer exists.

High-frequency feeds should stay bounded by short lookbacks and source filters
where PJM supports them. Do not start broad 15-second or all-node five-minute
pulls until the consuming model needs that grain.

## Pull Tiers

## Current Production Criticality

The current production-critical price workflows are:

- `da_hrl_lmps` for day-ahead hourly LMP readiness.
- `rt_fivemin_hrl_lmps` for operational verified five-minute real-time LMP
  readiness across hub, zone, and interface pricing nodes.

All other promoted PJM Data Miner feeds currently stay in the support batch
unless a downstream consumer requires a dedicated readiness event or tighter
schedule. `rt_fivemin_mnt_lmps` remains support-batch by default because the
current priority is operational verified five-minute HRL prices, not a separate
settlement-final five-minute readiness workflow.

### Tier 0 - Already Promoted Or In Flight

These feeds define the current PJM pricing foundation.

| Feed | Display name | Why pull | Runtime stance |
|---|---|---|---|
| da_hrl_lmps | Day-Ahead Hourly LMPs | Core DA price curve | Daily, current/version-aware |
| rt_hrl_lmps | Real-Time Hourly LMPs | Core verified RT price curve | Daily business-day pull |
| unverified_five_min_lmps | Unverified Five Minute LMPs | Near-real-time intraday price signal | Short lookback, filtered to needed node types |
| rt_fivemin_mnt_lmps | Settlements Verified Five Minute LMPs | Settlement-quality five-minute RT prices | Daily business-day pull |
| rt_fivemin_hrl_lmps | Real-Time Five Minute LMPs | Current verified five-minute RT prices | Current rows only; hub/zone/interface scope |
| five_min_tie_flows | Five Minute Tie Flows | Interchange context for PJM border behavior | Short lookback |
| pnode | Pricing Nodes | Active pricing-node reference table | Active nodes only |
| agg_definitions | Fixed Weighted Average Aggregate Definitions | Active aggregate pricing-node composition | Active definitions only |
| rt_unverified_hrl_lmps | Real-Time Unverified Hourly LMPs | Faster hourly RT price before verified settlement data | Short lookback; hub/zone/interface scope |
| ops_sum_frcstd_tran_lim | Operations Summary - Forecast Transfer Limits | Frontend operations dashboard context | Morning 05:05-08:05 EPT refresh |
| ops_sum_frcst_peak_area | Operations Summary - Projected Area Statistics at Peak | Frontend operations dashboard context | Morning 05:05-08:05 EPT refresh |
| ops_sum_frcst_peak_rto | Operations Summary - Projected RTO Statistics at Peak | Frontend operations dashboard context | Morning 05:05-08:05 EPT refresh |
| ops_sum_prev_period | Operations Summary - Actual Operational Statistics | Frontend operations dashboard context | Morning 05:05-08:05 EPT refresh; sparse before 2017-05-31 |
| ops_sum_prjctd_tie_flow | Operations Summary - Projected Scheduled Tie Flow | Frontend operations dashboard context | Morning 05:05-08:05 EPT refresh |

### Tier 1 - Promote Next

These feeds should be the next build queue because they directly support LMP
analysis, load/weather-normalization work, and outage/transmission context.

| Feed | Display name | Category | Posting | Retention | Why pull |
|---|---|---|---|---|---|
| rt_unverified_fivemin_lmps | Real-Time Unverified Five Minute LMPs | Locational Marginal Prices | Every 5 minutes | 15 days | Faster five-minute RT price before verified settlement data |
| inst_load | Instantaneous Load | Load | Every 5 minutes | 30 days | Near-real-time load driver for price moves |
| very_short_load_frcst | Five Minute Load Forecast | Load Forecast | Every 5 minutes | 30 days | Forecast-vs-actual load at intraday grain |
| load_frcstd_7_day | Seven-Day Load Forecast | Load Forecast | Hourly | None | Forward load expectations |
| load_frcstd_hist | Historical Load Forecasts | Load Forecast | Daily | Indefinitely | Forecast error history and model training set |
| hrl_load_prelim | Hourly Load: Preliminary | Load | Daily | Indefinitely | Early hourly actual load |
| hrl_load_metered | Hourly Load: Metered | Load | Daily | Indefinitely | Verified hourly actual load |
| gen_by_fuel | Generation by Fuel Type | Generation | Hourly | Indefinitely | Stack and fuel-mix context |
| five_min_solar_generation | Five Minute Solar Generation | Generation | Every 5 minutes | 30 days | Intraday renewable actuals |
| instantaneous_wind_gen | Instantaneous Wind Generation | Generation | Every 15 seconds | 30 days | Wind actuals; promote with bounded cadence or aggregation |
| wind_gen | Wind Generation | Generation | Daily | Indefinitely | Historical wind actuals by area |
| solar_gen | Solar Generation | Generation | Daily | Indefinitely | Historical solar actuals by area |
| five_min_wind_power_forecast | Five Minute Wind Power Forecast | Generation | Every 10 minutes | 30 days | Intraday wind forecast error |
| five_min_solar_power_forecast | Five Minute Solar Power Forecast | Generation | Every 10 minutes | 30 days | Intraday solar forecast error |
| hourly_wind_power_forecast | Hourly Wind Power Forecast | Generation | Every 10 minutes | 30 days | Hourly wind forecast curve |
| hourly_solar_power_forecast | Hourly Solar Power Forecast | Generation | Hourly | 30 days | Hourly solar forecast curve |
| day_gen_capacity | Daily Generation Capacity | Generation | Daily | Indefinitely | Available capacity context |
| rt_and_self_ecomax | Scheduled Generation | Generation | Daily | Indefinitely | Scheduled and self-scheduled economic max context |
| frcstd_gen_outages | Forecasted Generation Outages | Generation | Daily | Indefinitely | Forward outage risk |
| gen_outages_by_type | Generation Outage for Seven Days by Type | Generation | Daily | Indefinitely | Near-term outage mix |
| da_transconstraints | Day-Ahead Transmission Constraints | Constraints | Daily | Indefinitely | DA congestion drivers |
| da_marginal_value | Day-Ahead Marginal Value | Constraints | Daily | Indefinitely | DA constraint shadow prices |
| rt_marginal_value | Real-Time Marginal Value | Constraints | Daily on Business Days | Indefinitely | RT constraint shadow prices |
| da_interface_flows_and_limits | Day Ahead Interface Flows and Limits | Imports and Exports | Daily | Indefinitely | Interface capacity and DA schedule context |
| rt_scheduled_interchange | Real-Time Scheduled Interchange | Imports and Exports | Daily | Indefinitely | RT interchange schedule context |

### Tier 2 - Promote When The Use Case Needs It

These are useful for ancillary services, reserves, operating conditions, and
participant behavior, but they should follow the core price/load/generation
stack.

| Feed | Display name | Category | Why pull later |
|---|---|---|---|
| ancillary_services | Real-Time Ancillary Service Hourly LMPs | Locational Marginal Prices | RT ancillary price context |
| ancillary_services_fivemin_hrl | Real-Time Ancillary Service Five-Minute LMPs | Locational Marginal Prices | Five-minute ancillary price context |
| da_ancillary_services | Day-Ahead Ancillary Service LMPs | Locational Marginal Prices | DA ancillary price context |
| da_reserve_market_results | Day-Ahead Ancillary Service Market Results | Ancillary Services | Reserve market clearing details |
| reserve_market_results | Real-Time Ancillary Service Market Results | Ancillary Services | RT reserve market clearing details |
| dispatched_reserves | Dispatched Reserves | Ancillary Services | Five-minute reserve deployment |
| rt_dispatch_reserves | Real-Time Dispatched Reserves | Ancillary Services | Verified dispatched reserves |
| operational_reserves | Operational Reserves | Ancillary Services | High-frequency reserve status |
| reg_prices | Regulation Prices | Ancillary Services | Five-minute regulation price context |
| area_control_error | Area Control Error | System Information | High-frequency system imbalance |
| transmission_limits | Transmission Limits | System Information | Five-minute transmission limits |
| transfer_interface_infor | Transfer Interface Information | System Information | Interface reference and limits |
| it_sced_bias | IT SCED Bias | System Information | Dispatch bias diagnostics |
| rt_sced_bias | RT SCED Bias | System Information | Dispatch bias diagnostics |
| lpc_bias | LPC Bias | System Information | Dispatch model diagnostics |
| rt_tempset | Real-Time Temperature Sets | System Information | RT constraint-temperature context |
| act_sch_interchange | Actual/Schedule Summary Report | Imports and Exports | Actual vs scheduled tie-line history |
| state_net_interchange | Hourly Net Exports by State | Imports and Exports | State-level interchange history |
| transfer_limits_and_flows | RTO Transfer Limit and Flows | Imports and Exports | Monthly transfer summary |
| day_inc_dec_utc | Daily Cleared INCs, DECs and UTCs | Bid and Offer Data | Virtual transaction behavior |
| hrl_dmd_bids | Hourly Demand Bid Data | Bid and Offer Data | Demand bidding context |
| hrl_da_incs_decs | Hourly Day-Ahead Increment Offer and Decrement Bid Data | Bid and Offer Data | Virtual bidding context |
| hrl_da_demand_bids | Hourly Day-Ahead Demand Bids | Bid and Offer Data | DA demand bid context |
| energy_market_offers | Energy Market Generation Offers | Bid and Offer Data | Supply-offer context, likely heavy |
| rt_default_mv_override | Real-Time Default Marginal Value Override | Constraints | Constraint override history |
| rt_short_term_mv_override | Real-Time Short-Term Marginal Value Override | Constraints | Short-term constraint override history |
| da_ratings | Day-Ahead Ratings | Constraints | Constraint rating context |
| m2m_rt_ffe | Market to Market Flowgate FFE | Constraints | M2M congestion context |

### Tier 3 - Defer By Default

Do not promote these until a consumer asks for them.

| Group | Feeds | Reason to defer |
|---|---|---|
| Credit | nodal_ref_prices, nodal_refe_prices_incdec, utc_bid_screening | Credit-screening workflow, not core market analytics |
| FTR | ftr_bids_annual, ftr_bids_long_term, ftr_bids_mnt, ftr_cong_lmp, mnt_ftr_zonal_lmps | Auction/credit workflow; different grain and consumers |
| Billing and settlements detail | bal_trns_cong_prelim_billing, bill_deter_mnt_load, final_pai_interval, fivemin_pai_interval, load_recon_bill_deter_daily, load_recon_bill_deter_hrly, pai_final_balancing_ratio, pai_prelim_balancing_ratio, pjm_miso_da, pjm_miso_rt, prelim_or_rates, sched_9_10_rates | Settlement allocation, billing determinant, or PAI workflow |
| Uplift | demand_response_uplift_credit, gen_specific_uplift_credit, uplift_charges_by_zone, uplift_credits_by_zone | Monthly charge allocation rather than price-formation driver |
| Emissions | fivemin_marginal_emissions, hourly_marginal_emissions, hourly_emission_rates | Useful later for carbon analytics; not required for the core PJM power stack |
| Monthly operations | mnt_efor, off_cost_ops, ops_init_commit, reg_market_results | Low cadence and specialized operational context |
| Retired | ancillary_services_fivemin_mnt, ancillary_services_monthly, da_tempset, dasr_results, non_sync_reserve, rt_transn_constraints, sync_reserve_prelim_bill, uplift_by_zone | Retired feed category; avoid unless historical compatibility is required |
| Reserve billing reference | non_sync_reserve_prelim_billing, reg_zone_prelim_bill, secondary_nonsync_reserve_prelim_billing, sync_reserve_events, sync_reserve_prelim_billing, sync_pri_reserves_buses_list, sync_pri_reserves_resources_list | Reserve billing and reference workflows should follow reserve market consumers |
| Administrative load | annual_zonal_nspl, hrl_load_estimated | Less useful than preliminary, metered, and forecast load for price analysis |
| Losses | gen_ehv_losses | Specialized loss accounting; defer until a loss model needs it |

## Recommended Promotion Order

Promote the next feeds in this order:

1. `rt_unverified_fivemin_lmps`
2. `inst_load`
3. `very_short_load_frcst`
4. `load_frcstd_7_day`
5. `load_frcstd_hist`
6. `hrl_load_prelim`
7. `hrl_load_metered`
8. `gen_by_fuel`
9. `five_min_solar_generation`
10. `instantaneous_wind_gen`
11. `five_min_wind_power_forecast`
12. `five_min_solar_power_forecast`
13. `wind_gen`
14. `solar_gen`
15. `day_gen_capacity`
16. `rt_and_self_ecomax`
17. `frcstd_gen_outages`
18. `gen_outages_by_type`
19. `da_transconstraints`
20. `da_marginal_value`
21. `rt_marginal_value`
22. `da_interface_flows_and_limits`
23. `rt_scheduled_interchange`

After those are stable, promote Tier 2 based on the first downstream consumer:
ancillary/reserve analytics, constraint diagnostics, virtual bidding analytics,
or an operations dashboard.

## Per-Feed Promotion Contract

For every feed promoted from this selection note:

- Backend module name, scrape name, and destination table name must exactly
  match the PJM Data Miner 2 feed short name.
- Destination schema is `pjm`.
- Table DDL and index SQL live in
  `dbt/azure_postgres/models/power/pjm/<feed_short_name>/` as disabled
  operator SQL.
- Enabled dbt files stay read-only: source, staging, and final shaping models.
- The source contract must document feed short name, display name, category,
  posting frequency, retention, grain, uniqueness key, and freshness field.
- Runtime writes use backend `helios_admin` upserts.
- Initial promotion does not backfill unless explicitly requested.
- High-frequency feeds must use a bounded default lookback.
