/*
Create HeliosCTA Azure SQL database roles.

Run this while connected to `GenscapeDataFeed` as a database admin, db_owner,
or security admin principal. Do not run this from the read-only application
connection.
*/

SET NOCOUNT ON;

IF NOT EXISTS (
    SELECT 1
    FROM sys.database_principals
    WHERE name = N'helios_readonly'
      AND type = N'R'
)
BEGIN
    CREATE ROLE [helios_readonly] AUTHORIZATION [dbo];
END;

SELECT
    DB_NAME() AS database_name,
    name AS role_name,
    type_desc,
    create_date,
    modify_date
FROM sys.database_principals
WHERE name = N'helios_readonly';
