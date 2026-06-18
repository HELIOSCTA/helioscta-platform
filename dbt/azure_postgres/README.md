# HeliosCTA Azure Postgres dbt

Read-only dbt project for validating and shaping Azure Postgres data.

The committed profile uses environment variables only. Do not commit literal
passwords or production credentials. Load a local `.env` file from this
directory before running dbt.

## Credentials

Use a read-only Postgres role. Copy `.env.example` to `.env` in this directory:

```powershell
Copy-Item .env.example .env
```

Then fill in:

```text
DBT_POSTGRES_HOST=
DBT_POSTGRES_READONLY_USER=helios_readonly
DBT_POSTGRES_READONLY_PASSWORD=
DBT_POSTGRES_PORT=5432
DBT_POSTGRES_DBNAME=helios_prod
DBT_POSTGRES_SSLMODE=require
```

## PJM Data Miner 2 Layout

The PJM Data Miner 2 work lives under one folder per feed short name:

```text
models/power/pjm/pnode/
models/power/pjm/pnode/pjm_pnode/
models/power/pjm/da_hrl_lmps/
models/power/pjm/da_hrl_lmps/pjm_lmps_da/
models/power/pjm/rt_hrl_lmps/
models/power/pjm/rt_hrl_lmps/pjm_lmps_rt/
models/power/pjm/unverified_five_min_lmps/
models/power/pjm/unverified_five_min_lmps/pjm_lmps_unverified_five_min/
models/power/pjm/rt_fivemin_mnt_lmps/
models/power/pjm/rt_fivemin_mnt_lmps/pjm_lmps_rt_fivemin_mnt/
models/power/pjm/rt_fivemin_hrl_lmps/
models/power/pjm/rt_fivemin_hrl_lmps/pjm_lmps_rt_fivemin_hrl/
models/power/pjm/five_min_tie_flows/
models/power/pjm/five_min_tie_flows/pjm_five_min_tie_flows/
models/power/pjm/act_sch_interchange/
models/power/pjm/act_sch_interchange/pjm_act_sch_interchange/
models/power/pjm/agg_definitions/
models/power/pjm/agg_definitions/pjm_agg_definitions/
models/power/pjm/ancillary_services/
models/power/pjm/ancillary_services/pjm_ancillary_services/
models/power/pjm/da_interface_flows_and_limits/
models/power/pjm/da_interface_flows_and_limits/pjm_da_interface_flows_and_limits/
models/power/pjm/da_marginal_value/
models/power/pjm/da_marginal_value/pjm_da_marginal_value/
models/power/pjm/da_transconstraints/
models/power/pjm/da_transconstraints/pjm_da_transconstraints/
models/power/pjm/day_gen_capacity/
models/power/pjm/day_gen_capacity/pjm_day_gen_capacity/
models/power/pjm/dispatched_reserves/
models/power/pjm/dispatched_reserves/pjm_dispatched_reserves/
models/power/pjm/five_min_solar_generation/
models/power/pjm/five_min_solar_generation/pjm_five_min_solar_generation/
models/power/pjm/load_frcstd_hist/
models/power/pjm/load_frcstd_hist/pjm_load_frcstd_hist/
models/power/pjm/hrl_load_metered/
models/power/pjm/hrl_load_metered/pjm_hrl_load_metered/
models/power/pjm/hrl_load_prelim/
models/power/pjm/hrl_load_prelim/pjm_hrl_load_prelim/
models/power/pjm/hrl_dmd_bids/
models/power/pjm/hrl_dmd_bids/pjm_hrl_dmd_bids/
models/power/pjm/frcstd_gen_outages/
models/power/pjm/frcstd_gen_outages/pjm_frcstd_gen_outages/
models/power/pjm/rt_dispatch_reserves/
models/power/pjm/rt_dispatch_reserves/pjm_rt_dispatch_reserves/
models/power/pjm/reserve_market_results/
models/power/pjm/reserve_market_results/pjm_reserve_market_results/
models/power/pjm/rt_default_mv_override/
models/power/pjm/rt_default_mv_override/pjm_rt_default_mv_override/
models/power/pjm/rt_marginal_value/
models/power/pjm/rt_marginal_value/pjm_rt_marginal_value/
models/power/pjm/rt_short_term_mv_override/
models/power/pjm/rt_short_term_mv_override/pjm_rt_short_term_mv_override/
models/power/pjm/rt_unverified_hrl_lmps/
models/power/pjm/rt_unverified_hrl_lmps/pjm_rt_unverified_hrl_lmps/
models/power/pjm/load_frcstd_7_day/
models/power/pjm/load_frcstd_7_day/pjm_load_frcstd_7_day/
models/power/pjm/gen_outages_by_type/
models/power/pjm/gen_outages_by_type/pjm_gen_outages_by_type/
models/power/pjm/solar_gen/
models/power/pjm/solar_gen/pjm_solar_gen/
models/power/pjm/wind_gen/
models/power/pjm/wind_gen/pjm_wind_gen/
```

This mirrors the legacy power-model folder style while using the shorter
`models/power/pjm/<feed_short_name>/` path in this repo.

## ERCOT Public Reports Layout

The first ERCOT Public Reports feed uses the same one-folder-per-feed pattern:

```text
models/power/ercot/dam_stlmnt_pnt_prices/
models/power/ercot/dam_stlmnt_pnt_prices/ercot_lmps_da_hourly/
models/power/ercot/dam_stlmnt_pnt_prices/ercot_lmps_da_daily/
models/power/ercot/settlement_point_prices/
models/power/ercot/settlement_point_prices/ercot_lmps_rt_15min/
models/power/ercot/settlement_point_prices/ercot_lmps_rt_hourly/
models/power/ercot/actual_system_load/
models/power/ercot/actual_system_load/ercot_actual_load_hourly/
models/power/ercot/dam_shadow_prices/
models/power/ercot/dam_shadow_prices/ercot_dam_shadow_prices/
models/power/ercot/sced_shadow_prices/
models/power/ercot/sced_shadow_prices/ercot_sced_shadow_prices/
models/power/ercot/wind_power_production_hourly/
models/power/ercot/wind_power_production_hourly/ercot_wind_power_hourly/
models/power/ercot/solar_power_production_hourly/
models/power/ercot/solar_power_production_hourly/ercot_solar_power_hourly/
models/power/ercot/wind_power_actual_5min/
models/power/ercot/wind_power_actual_5min/ercot_wind_power_actual_5min/
models/power/ercot/solar_power_actual_5min/
models/power/ercot/solar_power_actual_5min/ercot_solar_power_actual_5min/
models/power/ercot/hourly_resource_outage_capacity/
models/power/ercot/hourly_resource_outage_capacity/ercot_resource_outage_capacity_hourly/
models/power/ercot/short_term_system_adequacy/
models/power/ercot/short_term_system_adequacy/ercot_short_term_system_adequacy/
models/power/ercot/seven_day_load_forecast/
models/power/ercot/seven_day_load_forecast/ercot_load_forecast_hourly/
models/power/ercot/seven_day_load_forecast/ercot_load_forecast_latest_hourly/
```

`table_ercot_dam_stlmnt_pnt_prices.sql` and
`index_ercot_dam_stlmnt_pnt_prices.sql`, plus the matching
`settlement_point_prices`, `actual_system_load`,
`seven_day_load_forecast`, `dam_shadow_prices`, `sced_shadow_prices`,
`wind_power_production_hourly`, and `solar_power_production_hourly` table/index
files, plus `wind_power_actual_5min`, `solar_power_actual_5min`, and
`hourly_resource_outage_capacity` and `short_term_system_adequacy`, are
disabled operator SQL. The enabled models are read-only validation/query
shaping only.

## Load Environment

Git Bash:

```bash
cd dbt/azure_postgres
set -a
source .env
set +a
```

PowerShell:

```powershell
cd dbt/azure_postgres
Get-Content .env | ForEach-Object {
    if ($_ -and -not $_.Trim().StartsWith("#")) {
        $name, $value = $_ -split "=", 2
        Set-Item -Path "Env:$($name.Trim())" -Value $value.Trim().Trim('"').Trim("'")
    }
}
```

## Read-Only Commands

```bash
cd dbt/azure_postgres
dbt debug --profiles-dir .
dbt parse --profiles-dir .
dbt compile --profiles-dir . --select path:models/power/pjm/pnode/pjm_pnode
dbt compile --profiles-dir . --select path:models/power/pjm/da_hrl_lmps/pjm_lmps_da
dbt compile --profiles-dir . --select path:models/power/pjm/rt_hrl_lmps/pjm_lmps_rt
dbt compile --profiles-dir . --select path:models/power/pjm/unverified_five_min_lmps/pjm_lmps_unverified_five_min
dbt compile --profiles-dir . --select path:models/power/pjm/rt_fivemin_mnt_lmps/pjm_lmps_rt_fivemin_mnt
dbt compile --profiles-dir . --select path:models/power/pjm/rt_fivemin_hrl_lmps/pjm_lmps_rt_fivemin_hrl
dbt compile --profiles-dir . --select path:models/power/pjm/five_min_tie_flows/pjm_five_min_tie_flows
dbt compile --profiles-dir . --select path:models/power/pjm/act_sch_interchange/pjm_act_sch_interchange
dbt compile --profiles-dir . --select path:models/power/pjm/agg_definitions/pjm_agg_definitions
dbt compile --profiles-dir . --select path:models/power/pjm/ancillary_services/pjm_ancillary_services
dbt compile --profiles-dir . --select path:models/power/pjm/da_interface_flows_and_limits/pjm_da_interface_flows_and_limits
dbt compile --profiles-dir . --select path:models/power/pjm/da_marginal_value/pjm_da_marginal_value
dbt compile --profiles-dir . --select path:models/power/pjm/da_transconstraints/pjm_da_transconstraints
dbt compile --profiles-dir . --select path:models/power/pjm/day_gen_capacity/pjm_day_gen_capacity
dbt compile --profiles-dir . --select path:models/power/pjm/dispatched_reserves/pjm_dispatched_reserves
dbt compile --profiles-dir . --select path:models/power/pjm/five_min_solar_generation/pjm_five_min_solar_generation
dbt compile --profiles-dir . --select path:models/power/pjm/load_frcstd_hist/pjm_load_frcstd_hist
dbt compile --profiles-dir . --select path:models/power/pjm/hrl_load_metered/pjm_hrl_load_metered
dbt compile --profiles-dir . --select path:models/power/pjm/hrl_load_prelim/pjm_hrl_load_prelim
dbt compile --profiles-dir . --select path:models/power/pjm/hrl_dmd_bids/pjm_hrl_dmd_bids
dbt compile --profiles-dir . --select path:models/power/pjm/frcstd_gen_outages/pjm_frcstd_gen_outages
dbt compile --profiles-dir . --select path:models/power/pjm/rt_dispatch_reserves/pjm_rt_dispatch_reserves
dbt compile --profiles-dir . --select path:models/power/pjm/reserve_market_results/pjm_reserve_market_results
dbt compile --profiles-dir . --select path:models/power/pjm/rt_default_mv_override/pjm_rt_default_mv_override
dbt compile --profiles-dir . --select path:models/power/pjm/rt_marginal_value/pjm_rt_marginal_value
dbt compile --profiles-dir . --select path:models/power/pjm/rt_short_term_mv_override/pjm_rt_short_term_mv_override
dbt compile --profiles-dir . --select path:models/power/pjm/rt_unverified_hrl_lmps/pjm_rt_unverified_hrl_lmps
dbt compile --profiles-dir . --select path:models/power/pjm/load_frcstd_7_day/pjm_load_frcstd_7_day
dbt compile --profiles-dir . --select path:models/power/pjm/gen_outages_by_type/pjm_gen_outages_by_type
dbt compile --profiles-dir . --select path:models/power/pjm/solar_gen/pjm_solar_gen
dbt compile --profiles-dir . --select path:models/power/pjm/wind_gen/pjm_wind_gen
```

`table_*.sql` and `index_*.sql` files are disabled as dbt models because
read-only credentials cannot create application objects or indexes. Keep them
as DBA/operator reference SQL only.

## ISO-NE ISO Express Layout

ISO-NE public CSV report feeds use the same one-folder-per-feed pattern:

```text
models/power/isone/da_hrl_lmps/
models/power/isone/da_hrl_lmps/isone_lmps_da_hourly/
models/power/isone/da_hrl_lmps/isone_lmps_da_daily/
models/power/isone/rt_hrl_lmps_final/
models/power/isone/rt_hrl_lmps_final/isone_lmps_rt_final_hourly/
models/power/isone/rt_hrl_lmps_final/isone_lmps_rt_final_daily/
models/power/isone/rt_hrl_lmps_prelim/
models/power/isone/rt_hrl_lmps_prelim/isone_lmps_rt_prelim_hourly/
models/power/isone/rt_hrl_lmps_prelim/isone_lmps_rt_prelim_daily/
models/power/isone/hourly_system_demand/
models/power/isone/hourly_system_demand/isone_hourly_system_demand/
models/power/isone/da_hrl_cleared_demand/
models/power/isone/da_hrl_cleared_demand/isone_da_hrl_cleared_demand/
models/power/isone/forecast_feeds/
models/power/isone/forecast_feeds/isone_forecast_feeds/
models/power/isone/rt_hrl_scheduled_interchange/
models/power/isone/rt_hrl_scheduled_interchange/isone_rt_hrl_scheduled_interchange/
models/power/isone/external_interface_metered_data/
models/power/isone/external_interface_metered_data/isone_external_interface_metered_data/
```

`table_isone_da_hrl_lmps.sql` and `index_isone_da_hrl_lmps.sql` are disabled
operator SQL, as are the matching RT final, RT preliminary, hourly system
demand, and day-ahead hourly cleared demand table and index files. The enabled
models are read-only validation/query shaping only. ISO-NE forecast batch
table and index SQL under `models/power/isone/forecast_feeds/` follows the
same disabled-operator-SQL pattern, as do the real-time hourly scheduled
interchange and external interface metered data table/index files.

Compile the ISO-NE DA LMP query-shaping models with:

```bash
cd dbt/azure_postgres
dbt compile --profiles-dir . --select path:models/power/isone/da_hrl_lmps/isone_lmps_da_hourly
dbt compile --profiles-dir . --select path:models/power/isone/da_hrl_lmps/isone_lmps_da_daily
dbt compile --profiles-dir . --select path:models/power/isone/rt_hrl_lmps_final/isone_lmps_rt_final_hourly
dbt compile --profiles-dir . --select path:models/power/isone/rt_hrl_lmps_final/isone_lmps_rt_final_daily
dbt compile --profiles-dir . --select path:models/power/isone/rt_hrl_lmps_prelim/isone_lmps_rt_prelim_hourly
dbt compile --profiles-dir . --select path:models/power/isone/rt_hrl_lmps_prelim/isone_lmps_rt_prelim_daily
dbt compile --profiles-dir . --select path:models/power/isone/hourly_system_demand/isone_hourly_system_demand
dbt compile --profiles-dir . --select path:models/power/isone/da_hrl_cleared_demand/isone_da_hrl_cleared_demand
dbt compile --profiles-dir . --select path:models/power/isone/external_interface_metered_data/isone_external_interface_metered_data
```

## MISO Public RT Data API Layout

MISO public RT Data API JSON feeds use the same one-folder-per-feed pattern:

```text
models/power/miso/real_time_total_load/
models/power/miso/real_time_total_load/miso_real_time_total_load/
```

`table_miso_real_time_total_load.sql` and
`index_miso_real_time_total_load.sql` are disabled operator SQL. The enabled
models are read-only validation/query shaping only.

Compile the MISO real-time total load query-shaping model with:

```bash
cd dbt/azure_postgres
dbt compile --profiles-dir . --select path:models/power/miso/real_time_total_load/miso_real_time_total_load
```

## Weather Layout

Weather feeds live under one folder per provider and feed:

```text
models/weather/noaa/metar_observations/
models/weather/noaa/metar_observations/weather_noaa_metar_observations/
models/weather/wsi/hourly_observed/
models/weather/wsi/hourly_observed/weather_wsi_hourly_observed_temperatures/
```

`table_weather_noaa_metar_observations.sql` and
`index_weather_noaa_metar_observations.sql` are disabled operator SQL. The
enabled NOAA weather model is read-only query shaping over
`weather.noaa_metar_observations`.

`table_weather_wsi_hourly_observed_temperatures.sql` and
`index_weather_wsi_hourly_observed_temperatures.sql` are disabled operator SQL.
The enabled weather model is read-only query shaping over
`weather.wsi_hourly_observed_temperatures`.

Compile the weather query-shaping models with:

```bash
cd dbt/azure_postgres
dbt compile --profiles-dir . --select path:models/weather/noaa/metar_observations/weather_noaa_metar_observations
dbt compile --profiles-dir . --select path:models/weather/wsi/hourly_observed/weather_wsi_hourly_observed_temperatures
```

## Operator SQL

`schema_*.sql`, `table_*.sql`, and `index_*.sql` files are disabled as dbt
models. They are the source of truth for application object DDL and must be
applied manually with `helios_admin`; read-only dbt credentials cannot run
them.

Shared runtime observability objects for the database `ops` schema live under
`models/ops/`.

Run order for a new database:

```text
models/setup/schemas.sql
models/ops/table_ops_api_fetch_log.sql
models/ops/table_ops_data_availability_events.sql
models/power/ercot/dam_stlmnt_pnt_prices/table_ercot_dam_stlmnt_pnt_prices.sql
models/power/ercot/actual_system_load/table_ercot_actual_system_load.sql
models/power/ercot/dam_shadow_prices/table_ercot_dam_shadow_prices.sql
models/power/ercot/sced_shadow_prices/table_ercot_sced_shadow_prices.sql
models/power/ercot/wind_power_production_hourly/table_ercot_wind_power_production_hourly.sql
models/power/ercot/solar_power_production_hourly/table_ercot_solar_power_production_hourly.sql
models/power/ercot/wind_power_actual_5min/table_ercot_wind_power_actual_5min.sql
models/power/ercot/solar_power_actual_5min/table_ercot_solar_power_actual_5min.sql
models/power/ercot/hourly_resource_outage_capacity/table_ercot_hourly_resource_outage_capacity.sql
models/power/ercot/short_term_system_adequacy/table_ercot_short_term_system_adequacy.sql
models/power/ercot/seven_day_load_forecast/table_ercot_seven_day_load_forecast.sql
models/power/isone/da_hrl_lmps/table_isone_da_hrl_lmps.sql
models/power/isone/rt_hrl_lmps_final/table_isone_rt_hrl_lmps_final.sql
models/power/isone/rt_hrl_lmps_prelim/table_isone_rt_hrl_lmps_prelim.sql
models/power/isone/hourly_system_demand/table_isone_hourly_system_demand.sql
models/power/isone/da_hrl_cleared_demand/table_isone_da_hrl_cleared_demand.sql
models/power/isone/rt_hrl_scheduled_interchange/table_isone_rt_hrl_scheduled_interchange.sql
models/power/isone/external_interface_metered_data/table_isone_external_interface_metered_data.sql
models/power/miso/real_time_total_load/table_miso_real_time_total_load.sql
models/power/pjm/<feed_short_name>/table_*.sql
models/weather/noaa/metar_observations/table_weather_noaa_metar_observations.sql
models/weather/wsi/hourly_observed/table_weather_wsi_hourly_observed_temperatures.sql
models/ops/index_*.sql
models/power/ercot/dam_stlmnt_pnt_prices/index_ercot_dam_stlmnt_pnt_prices.sql
models/power/ercot/actual_system_load/index_ercot_actual_system_load.sql
models/power/ercot/dam_shadow_prices/index_ercot_dam_shadow_prices.sql
models/power/ercot/sced_shadow_prices/index_ercot_sced_shadow_prices.sql
models/power/ercot/wind_power_production_hourly/index_ercot_wind_power_production_hourly.sql
models/power/ercot/solar_power_production_hourly/index_ercot_solar_power_production_hourly.sql
models/power/ercot/wind_power_actual_5min/index_ercot_wind_power_actual_5min.sql
models/power/ercot/solar_power_actual_5min/index_ercot_solar_power_actual_5min.sql
models/power/ercot/hourly_resource_outage_capacity/index_ercot_hourly_resource_outage_capacity.sql
models/power/ercot/short_term_system_adequacy/index_ercot_short_term_system_adequacy.sql
models/power/ercot/seven_day_load_forecast/index_ercot_seven_day_load_forecast.sql
models/power/isone/da_hrl_lmps/index_isone_da_hrl_lmps.sql
models/power/isone/rt_hrl_lmps_final/index_isone_rt_hrl_lmps_final.sql
models/power/isone/rt_hrl_lmps_prelim/index_isone_rt_hrl_lmps_prelim.sql
models/power/isone/hourly_system_demand/index_isone_hourly_system_demand.sql
models/power/isone/da_hrl_cleared_demand/index_isone_da_hrl_cleared_demand.sql
models/power/isone/rt_hrl_scheduled_interchange/index_isone_rt_hrl_scheduled_interchange.sql
models/power/isone/external_interface_metered_data/index_isone_external_interface_metered_data.sql
models/power/miso/real_time_total_load/index_miso_real_time_total_load.sql
models/power/pjm/<feed_short_name>/index_*.sql
models/weather/noaa/metar_observations/index_weather_noaa_metar_observations.sql
models/weather/wsi/hourly_observed/index_weather_wsi_hourly_observed_temperatures.sql
infrastructure/azure-postgres/permissions/01_apply_database_permissions.sql
```

Enabled dbt models remain read-only validation/query shaping only.
