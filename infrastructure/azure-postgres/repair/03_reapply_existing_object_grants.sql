/*
Reapply permissions to existing tables and sequences.

Run this while connected to `helios_prod` as `helios_admin`.

Use this when tables already existed before roles/grants were cleaned up.
*/

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
