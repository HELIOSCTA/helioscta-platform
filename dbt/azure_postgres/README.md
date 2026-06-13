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
models/power/pjm/<feed_short_name>/table_*.sql
models/ops/index_*.sql
models/power/pjm/<feed_short_name>/index_*.sql
infrastructure/azure-postgres/permissions/01_apply_database_permissions.sql
```

Enabled dbt models remain read-only validation/query shaping only.
