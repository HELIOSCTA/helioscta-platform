# Azure Postgres Setup

Operator-run SQL for creating the clean HeliosCTA production database and
read-only role on the existing Azure Postgres server.

Run these manually with the Azure Postgres admin user. Replace placeholder
passwords before execution. Do not commit real passwords.

## Order

1. Connect to the maintenance database, usually `postgres`, and run:
   - `bootstrap/01_roles.sql`
   - `bootstrap/02_databases.sql`
2. Connect to `helios_prod` as `helios_admin` and apply the application schema,
   table, index, observability, and notification DDL required by the workflows
   being enabled. Reference SQL for promoted application objects lives under
   `dbt/azure_postgres/reference_sql/ddl`; it is operator-applied SQL, not a
   dbt-managed migration system.
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
- `helios_readonly` - frontend read paths and inspection queries.

## Database Shape

```text
existing Azure Postgres server
  postgres              maintenance connection database
  helios_prod           clean promoted runtime database
```

## Notes

- `CREATE DATABASE` cannot run inside a transaction block.
- `CREATE INDEX CONCURRENTLY` also cannot run inside a transaction block.
- Application schema, table, and index DDL is operator-applied from reference
  SQL under `dbt/azure_postgres/reference_sql/ddl`. Apply the required DDL with
  `helios_admin` before enabling backend workflows that write to those objects.
- Shared runtime observability and notification tables are application objects.
  Apply them before enabling workflows that emit API telemetry,
  data-availability events, or email notifications.
- `permissions/01_apply_database_permissions.sql` applies read-only grants to
  existing application schemas and installs read-only defaults for future
  schemas, tables, and sequences created by `helios_admin`.
- `ALTER DEFAULT PRIVILEGES FOR ROLE helios_admin` should be run by
  `helios_admin` or a role that is a member of `helios_admin`.
- Use `helios_readonly` for frontend read paths and inspection queries. It
  should not own or mutate objects.
- Use `helios_admin` for scheduled backend scrape scripts and schema changes.

## Adding A Schema

After the initial permission script has been run, new schemas and tables do not
need a permission script rerun when they are created by `helios_admin`.

- Apply new application schemas with `helios_admin`.
- Apply direct-write backend tables before deploying code that writes them.
- Apply required indexes before enabling production schedules.
- Apply or update shared observability tables before deploying orchestration
  that depends on them.

The default privileges installed during setup grant `helios_readonly` and
backend access automatically.

Rerun `permissions/01_apply_database_permissions.sql` only when a schema was
created before the defaults existed or by a role other than `helios_admin`.
If the schema already contains tables owned by another role, use the repair
scripts.
