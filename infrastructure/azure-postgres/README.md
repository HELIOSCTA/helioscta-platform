# Azure Postgres Setup

Operator-run SQL for creating the clean HeliosCTA production database and
read-only role on the existing Azure Postgres server.

Run these manually with the Azure Postgres admin user. Replace placeholder
passwords before execution. Do not commit real passwords.

## Order

1. Connect to the maintenance database, usually `postgres`, and run:
   - `bootstrap/01_roles.sql`
   - `bootstrap/02_databases.sql`
2. Connect to `helios_prod` as `helios_admin` and run the disabled dbt
   operator SQL needed for application objects:
   - `dbt/azure_postgres/models/setup/schemas.sql`
   - `dbt/azure_postgres/models/ops/table_ops_api_fetch_log.sql`
   - `dbt/azure_postgres/models/ops/table_ops_data_availability_events.sql`
   - required feed `table_*.sql` files, such as
     `dbt/azure_postgres/models/power/pjm/da_hrl_lmps/table_pjm_da_hrl_lmps.sql`
     or
     `dbt/azure_postgres/models/power/ercot/dam_stlmnt_pnt_prices/table_ercot_dam_stlmnt_pnt_prices.sql`
     or
     `dbt/azure_postgres/models/power/isone/da_hrl_lmps/table_isone_da_hrl_lmps.sql`
     or
     `dbt/azure_postgres/models/power/isone/rt_hrl_lmps_final/table_isone_rt_hrl_lmps_final.sql`
     or
     `dbt/azure_postgres/models/power/isone/rt_hrl_lmps_prelim/table_isone_rt_hrl_lmps_prelim.sql`
     or
     `dbt/azure_postgres/models/power/isone/hourly_system_demand/table_isone_hourly_system_demand.sql`
     or
     `dbt/azure_postgres/models/power/isone/da_hrl_cleared_demand/table_isone_da_hrl_cleared_demand.sql`
     or
     `dbt/azure_postgres/models/power/isone/rt_hrl_scheduled_interchange/table_isone_rt_hrl_scheduled_interchange.sql`
     or
     `dbt/azure_postgres/models/power/isone/external_interface_metered_data/table_isone_external_interface_metered_data.sql`
     or ISO-NE forecast table SQL under
     `dbt/azure_postgres/models/power/isone/forecast_feeds/`
     or
     `dbt/azure_postgres/models/power/miso/real_time_total_load/table_miso_real_time_total_load.sql`
     or
     `dbt/azure_postgres/models/weather/noaa/metar_observations/table_weather_noaa_metar_observations.sql`
     or
     `dbt/azure_postgres/models/weather/wsi/hourly_observed/table_weather_wsi_hourly_observed_temperatures.sql`
   - required `index_*.sql` files, including matching `ops` and feed indexes
3. Connect to `helios_prod` as `helios_admin` and run:
   - `permissions/01_apply_database_permissions.sql`
4. Verify `helios_prod` with:
   - `permissions/02_verify_permissions.sql`

If tables already existed before these grants were cleaned up, connect as
`helios_admin` and run:

- `repair/03_reapply_existing_object_grants.sql`

If `repair/03_reapply_existing_object_grants.sql` fails with `permission denied for
table ...`, inspect and transfer ownership first:

- `repair/01_inspect_existing_object_owners.sql`
- `repair/02_transfer_existing_object_ownership.sql` as the current table owner or
  Azure Postgres admin
- `repair/03_reapply_existing_object_grants.sql` as `helios_admin`

## Intended Roles

- `helios_admin` - backend/app role. Owns schemas, runs setup SQL, and executes
  scheduled backend writes.
- `helios_readonly` - dbt, frontend read paths, and inspection queries.

## Database Shape

```text
existing Azure Postgres server
  postgres              maintenance connection database
  helios_prod           clean promoted runtime database
```

## Notes

- `CREATE DATABASE` cannot run inside a transaction block.
- `CREATE INDEX CONCURRENTLY` also cannot run inside a transaction block.
- Application schema, table, and index DDL is documented under
  `dbt/azure_postgres/models/` as disabled operator reference SQL. Run those
  files manually with `helios_admin`.
- Shared runtime observability tables in `models/ops/` are application objects,
  not dbt runtime models. Apply them before enabling workflows that emit API
  telemetry or data-availability events.
- `permissions/01_apply_database_permissions.sql` applies read-only grants to
  existing application schemas and installs read-only defaults for future
  schemas, tables, and sequences created by `helios_admin`.
- `ALTER DEFAULT PRIVILEGES FOR ROLE helios_admin` should be run by
  `helios_admin` or a role that is a member of `helios_admin`.
- Use `helios_readonly` for dbt. It should not own or mutate objects.
- Use `helios_admin` for scheduled backend scrape scripts and schema changes.

## Adding A Schema

After the initial permission script has been run, new schemas and tables do not
need a permission script rerun when they are created by `helios_admin`.

- Add application schemas to `dbt/azure_postgres/models/setup/schemas.sql`.
- Add direct-write backend tables to disabled dbt `table_*.sql` operator SQL
  before deploying code that writes them.
- Add indexes to disabled dbt `index_*.sql` operator SQL.
- Add or update shared observability tables in `models/ops/` before deploying
  orchestration that depends on them.

To add a schema, update `dbt/azure_postgres/models/setup/schemas.sql` and run
that operator SQL manually with `helios_admin`.

The default privileges installed during setup grant `helios_readonly` and
backend access automatically.

Rerun `permissions/01_apply_database_permissions.sql` only when a schema was
created before the defaults existed or by a role other than `helios_admin`.
If the schema already contains tables owned by another role, use the repair
scripts.
