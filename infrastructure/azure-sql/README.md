# Azure SQL Setup

Operator-run SQL for creating the HeliosCTA read-only role and grants on the
Azure SQL `GenscapeDataFeed` database.

Run these manually with an Azure SQL database admin, `db_owner`, or security
admin connection. Replace placeholder passwords before execution. Do not commit
real passwords.

## Order

1. Connect to `GenscapeDataFeed` as a database admin, `db_owner`, or security
   admin and run:
   - `bootstrap/01_roles.sql`
2. Optional: create or attach a read-only database user with:
   - `bootstrap/02_readonly_user_template.sql`
3. Connect to `GenscapeDataFeed` as a database admin, `db_owner`, or another
   principal allowed to grant schema permissions and run:
   - `permissions/01_apply_database_permissions.sql`
4. Verify `GenscapeDataFeed` with:
   - `permissions/02_verify_permissions.sql`

## Intended Roles

- `helios_readonly` - frontend, reporting, dbt, and inspection read paths.
- `dbt_readonly` - existing contained SQL user currently assigned to built-in
  `db_datareader`; it can be moved to `helios_readonly` after validating the
  narrower grants.

## Database Shape

```text
existing Azure SQL server
  GenscapeDataFeed       natural gas data feed and frontend source database
```

## Notes

- `permissions/01_apply_database_permissions.sql` grants schema-level `SELECT`
  to `helios_readonly`. SQL Server schema-level grants cover existing and
  future tables/views in each granted schema.
- The permission script excludes SQL Server system role schemas, `guest`,
  `administration`, and the placeholder-looking `schema_name` schema.
- `administration.error_log` is operational logging and is not granted by
  default. Add it only after reviewing whether it is safe for read-only
  consumers.
- The current `azure-sql` MCP connection uses `dbt_readonly`; it can inventory
  and verify permissions but cannot create roles or grant schema permissions.
- Use `helios_readonly` for frontend read paths and inspection queries. It
  should not own or mutate objects.

## Adding A Schema

After the initial permission script has been run, rerun
`permissions/01_apply_database_permissions.sql` when a new application schema
is added and should be readable by frontend, dbt, reporting, or inspection
consumers.

Do not grant `helios_readonly` to a user that also has writer, DDL, owner, or
security-admin permissions if the intent is true read-only access.
