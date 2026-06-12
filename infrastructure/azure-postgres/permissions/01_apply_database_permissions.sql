/*
Initialize the HeliosCTA application database.

Run this while connected to `helios_prod` as `helios_admin`.

This script applies database permissions and installs read-only defaults for
future objects created by `helios_admin`.

Application schemas, tables, and indexes are documented as disabled dbt
operator SQL under `dbt/azure_postgres/models/` and must be applied manually
with `helios_admin`.
*/

REVOKE CREATE ON SCHEMA public FROM PUBLIC;
REVOKE CREATE ON SCHEMA public FROM helios_readonly;

DO $$
DECLARE
    db_name text := current_database();
BEGIN
    EXECUTE format('REVOKE ALL ON DATABASE %I FROM PUBLIC', db_name);
    EXECUTE format('GRANT CONNECT ON DATABASE %I TO helios_admin', db_name);
    EXECUTE format('GRANT CONNECT ON DATABASE %I TO helios_readonly', db_name);
END $$;

DO $$
DECLARE
    schema_name text;
BEGIN
    FOR schema_name IN
        SELECT nspname
        FROM pg_namespace
        WHERE nspname !~ '^pg_'
          AND nspname <> 'information_schema'
          AND nspname <> 'public'
        ORDER BY nspname
    LOOP
        EXECUTE format('GRANT USAGE ON SCHEMA %I TO helios_readonly', schema_name);
        EXECUTE format('GRANT SELECT ON ALL TABLES IN SCHEMA %I TO helios_readonly', schema_name);
        EXECUTE format('GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA %I TO helios_readonly', schema_name);
    END LOOP;
END $$;

ALTER DEFAULT PRIVILEGES FOR ROLE helios_admin
    GRANT USAGE ON SCHEMAS TO helios_readonly;

ALTER DEFAULT PRIVILEGES FOR ROLE helios_admin
    GRANT SELECT ON TABLES TO helios_readonly;

ALTER DEFAULT PRIVILEGES FOR ROLE helios_admin
    GRANT USAGE, SELECT ON SEQUENCES TO helios_readonly;
