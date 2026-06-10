# Azure Postgres Setup

Operator-run SQL for creating the clean HeliosCTA production database and
read-only role on the existing Azure Postgres server.

Run these manually with the Azure Postgres admin user. Replace placeholder
passwords before execution. Do not commit real passwords.

## Order

1. Connect to the maintenance database, usually `postgres`, and run:
   - `bootstrap/01_roles.sql`
   - `bootstrap/02_databases.sql`
2. Connect to `helios_prod` as `helios_admin` and run:
   - `permissions/01_apply_database_permissions.sql`
3. Verify `helios_prod` with:
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

- `helios_admin` - backend/app role. Owns schemas, creates tables, and runs
  migrations/cleanup.
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
- `permissions/01_apply_database_permissions.sql` creates the standard
  application schemas, creates base tables the backend inserts into directly,
  applies read-only grants, and installs read-only defaults for future schemas,
  tables, and sequences created by `helios_admin`.
- `ALTER DEFAULT PRIVILEGES FOR ROLE helios_admin` should be run by
  `helios_admin` or a role that is a member of `helios_admin`.
- Use `helios_readonly` for dbt. It should not own or mutate objects.
- Use `helios_admin` for scheduled backend scrape scripts and schema changes.

## Adding A Schema

After the initial permission script has been run, new schemas and tables do not
need a permission script rerun when they are created by `helios_admin`.

- Create schemas as `helios_admin`.
- Create migration/admin tables as `helios_admin`.
- Let backend runtime tables be created by `helios_admin`.

To add a schema, connect to `helios_prod` as `helios_admin` and run:

```sql
CREATE SCHEMA IF NOT EXISTS new_schema;
```

The default privileges installed during setup grant `helios_readonly` and
backend access automatically.

Rerun `permissions/01_apply_database_permissions.sql` only when a schema was
created before the defaults existed or by a role other than `helios_admin`.
If the schema already contains tables owned by another role, use the repair
scripts.
