/*
Inspect owners and current privileges for existing HeliosCTA objects.

Run while connected to `helios_prod`. This script is read-only.
*/

SELECT
    n.nspname AS schema_name,
    c.relname AS object_name,
    CASE c.relkind
        WHEN 'r' THEN 'table'
        WHEN 'p' THEN 'partitioned table'
        WHEN 'v' THEN 'view'
        WHEN 'm' THEN 'materialized view'
        WHEN 'S' THEN 'sequence'
        ELSE c.relkind::text
    END AS object_type,
    pg_get_userbyid(c.relowner) AS owner,
    has_table_privilege('helios_admin', c.oid, 'SELECT') AS admin_select,
    has_table_privilege('helios_admin', c.oid, 'INSERT') AS admin_insert,
    has_table_privilege('helios_admin', c.oid, 'UPDATE') AS admin_update,
    has_table_privilege('helios_readonly', c.oid, 'SELECT') AS readonly_select
FROM pg_class c
JOIN pg_namespace n
    ON n.oid = c.relnamespace
WHERE n.nspname !~ '^pg_'
  AND n.nspname <> 'information_schema'
  AND n.nspname <> 'public'
  AND c.relkind IN ('r', 'p', 'v', 'm', 'S')
ORDER BY n.nspname, c.relkind, c.relname;
