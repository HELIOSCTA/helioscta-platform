/*
Apply HeliosCTA Azure SQL database permissions.

Run this while connected to `GenscapeDataFeed` as a database admin, db_owner,
or a principal allowed to grant schema permissions.

The `helios_readonly` role must already exist. Schema-level SELECT grants cover
existing and future tables/views in each schema.
*/

SET NOCOUNT ON;

IF NOT EXISTS (
    SELECT 1
    FROM sys.database_principals
    WHERE name = N'helios_readonly'
      AND type = N'R'
)
BEGIN
    THROW 51000, 'Missing required database role: helios_readonly. Run bootstrap/01_roles.sql first.', 1;
END;

DECLARE @ReadableSchemas TABLE (
    schema_name sysname NOT NULL PRIMARY KEY
);

INSERT INTO @ReadableSchemas (schema_name)
SELECT s.name
FROM sys.schemas AS s
WHERE s.name NOT IN (
    N'sys',
    N'INFORMATION_SCHEMA',
    N'guest',
    N'db_accessadmin',
    N'db_backupoperator',
    N'db_datareader',
    N'db_datawriter',
    N'db_ddladmin',
    N'db_denydatareader',
    N'db_denydatawriter',
    N'db_securityadmin',
    N'administration',
    N'schema_name'
)
ORDER BY s.name;

DECLARE @schema_name sysname;
DECLARE @sql nvarchar(max);

DECLARE schema_cursor CURSOR LOCAL FAST_FORWARD FOR
    SELECT readable.schema_name
    FROM @ReadableSchemas AS readable
    ORDER BY readable.schema_name;

OPEN schema_cursor;

FETCH NEXT FROM schema_cursor INTO @schema_name;

WHILE @@FETCH_STATUS = 0
BEGIN
    SET @sql = N'GRANT SELECT ON SCHEMA::'
        + QUOTENAME(@schema_name)
        + N' TO [helios_readonly];';
    EXEC sys.sp_executesql @sql;

    FETCH NEXT FROM schema_cursor INTO @schema_name;
END;

CLOSE schema_cursor;
DEALLOCATE schema_cursor;

SELECT
    DB_NAME() AS database_name,
    N'helios_readonly' AS role_name,
    readable.schema_name,
    N'grant_applied' AS status
FROM @ReadableSchemas AS readable
ORDER BY readable.schema_name;
