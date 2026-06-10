/*
Read-only permission checks.

Run while connected to `helios_prod`.
*/

SELECT
    CURRENT_DATABASE() AS database_name,
    current_user AS current_user_name;

SELECT
    rolname,
    rolcanlogin,
    rolsuper,
    rolcreatedb,
    rolcreaterole
FROM pg_roles
WHERE rolname IN ('helios_admin', 'helios_readonly')
ORDER BY rolname;

SELECT
    n.nspname AS schema_name,
    pg_get_userbyid(n.nspowner) AS schema_owner,
    has_schema_privilege('helios_admin', n.oid, 'USAGE') AS admin_usage,
    has_schema_privilege('helios_admin', n.oid, 'CREATE') AS admin_create,
    has_schema_privilege('helios_readonly', n.oid, 'USAGE') AS readonly_usage,
    has_schema_privilege('helios_readonly', n.oid, 'CREATE') AS readonly_create
FROM pg_namespace n
WHERE n.nspname !~ '^pg_'
  AND n.nspname <> 'information_schema'
  AND n.nspname <> 'public'
ORDER BY n.nspname;

SELECT
    schemaname,
    tablename,
    tableowner,
    has_table_privilege('helios_admin', format('%I.%I', schemaname, tablename), 'SELECT') AS admin_select,
    has_table_privilege('helios_admin', format('%I.%I', schemaname, tablename), 'INSERT') AS admin_insert,
    has_table_privilege('helios_admin', format('%I.%I', schemaname, tablename), 'UPDATE') AS admin_update,
    has_table_privilege('helios_readonly', format('%I.%I', schemaname, tablename), 'SELECT') AS readonly_select,
    has_table_privilege('helios_readonly', format('%I.%I', schemaname, tablename), 'INSERT') AS readonly_insert
FROM pg_tables
WHERE schemaname !~ '^pg_'
  AND schemaname <> 'information_schema'
  AND schemaname <> 'public'
ORDER BY schemaname, tablename;
