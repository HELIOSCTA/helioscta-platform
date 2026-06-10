/*
Transfer existing HeliosCTA object ownership to helios_admin.

Run while connected to `helios_prod` as the current object owner, Azure
Postgres admin, or another role allowed to change object owners.

This is needed when existing tables were created by an old user. Without
ownership or grant option, `helios_admin` cannot grant privileges on those
tables to `helios_readonly`.
*/

DO $$
DECLARE
    obj record;
BEGIN
    FOR obj IN
        SELECT
            n.nspname AS schema_name,
            c.relname AS object_name,
            c.relkind,
            pg_get_userbyid(c.relowner) AS owner_name
        FROM pg_class c
        JOIN pg_namespace n
            ON n.oid = c.relnamespace
        WHERE n.nspname !~ '^pg_'
          AND n.nspname <> 'information_schema'
          AND n.nspname <> 'public'
          AND c.relkind IN ('r', 'p', 'v', 'm', 'S')
          AND pg_get_userbyid(c.relowner) <> 'helios_admin'
        ORDER BY n.nspname, c.relname
    LOOP
        RAISE NOTICE 'Changing owner of %.% from % to helios_admin',
            obj.schema_name,
            obj.object_name,
            obj.owner_name;

        IF obj.relkind = 'S' THEN
            EXECUTE format(
                'ALTER SEQUENCE %I.%I OWNER TO helios_admin',
                obj.schema_name,
                obj.object_name
            );
        ELSIF obj.relkind = 'v' THEN
            EXECUTE format(
                'ALTER VIEW %I.%I OWNER TO helios_admin',
                obj.schema_name,
                obj.object_name
            );
        ELSIF obj.relkind = 'm' THEN
            EXECUTE format(
                'ALTER MATERIALIZED VIEW %I.%I OWNER TO helios_admin',
                obj.schema_name,
                obj.object_name
            );
        ELSE
            EXECUTE format(
                'ALTER TABLE %I.%I OWNER TO helios_admin',
                obj.schema_name,
                obj.object_name
            );
        END IF;
    END LOOP;
END $$;
