/*
Optional template for creating or attaching a read-only database user.

Run this while connected to `GenscapeDataFeed` as a database admin, db_owner,
or security admin principal. Replace placeholders before execution. Do not
commit real passwords.
*/

SET NOCOUNT ON;

/*
Option A: contained SQL user with a password.

IF NOT EXISTS (
    SELECT 1
    FROM sys.database_principals
    WHERE name = N'<readonly_user_name>'
)
BEGIN
    CREATE USER [<readonly_user_name>]
    WITH PASSWORD = '<replace-with-generated-password>';
END;

ALTER ROLE [helios_readonly] ADD MEMBER [<readonly_user_name>];
*/

/*
Option B: database user mapped to an existing login or Microsoft Entra
principal.

IF NOT EXISTS (
    SELECT 1
    FROM sys.database_principals
    WHERE name = N'<readonly_user_or_principal_name>'
)
BEGIN
    CREATE USER [<readonly_user_or_principal_name>]
    FROM LOGIN [<existing_login_name>];
END;

ALTER ROLE [helios_readonly] ADD MEMBER [<readonly_user_or_principal_name>];
*/

/*
If moving the existing dbt_readonly user from broad db_datareader to the custom
role, run this only after confirming it does not need database-wide reads.

ALTER ROLE [helios_readonly] ADD MEMBER [dbt_readonly];
ALTER ROLE [db_datareader] DROP MEMBER [dbt_readonly];
*/

SELECT
    DB_NAME() AS database_name,
    role_principal.name AS role_name,
    member_principal.name AS member_name,
    member_principal.type_desc AS member_type_desc
FROM sys.database_role_members AS drm
JOIN sys.database_principals AS role_principal
    ON role_principal.principal_id = drm.role_principal_id
JOIN sys.database_principals AS member_principal
    ON member_principal.principal_id = drm.member_principal_id
WHERE role_principal.name IN (N'helios_readonly', N'db_datareader')
ORDER BY role_principal.name, member_principal.name;
