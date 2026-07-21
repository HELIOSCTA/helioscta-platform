/*
Read-only permission checks.

Run while connected to `GenscapeDataFeed`.
*/

SET NOCOUNT ON;

SELECT
    DB_NAME() AS database_name,
    SUSER_SNAME() AS login_name,
    USER_NAME() AS database_user,
    ORIGINAL_LOGIN() AS original_login;

SELECT
    dp.name,
    dp.type_desc,
    dp.authentication_type_desc,
    dp.default_schema_name,
    dp.create_date,
    dp.modify_date
FROM sys.database_principals AS dp
WHERE dp.name IN (N'helios_readonly', N'dbt_readonly')
   OR dp.type = N'R'
ORDER BY
    CASE WHEN dp.name = N'helios_readonly' THEN 0 ELSE 1 END,
    dp.type_desc,
    dp.name;

SELECT
    role_principal.name AS role_name,
    member_principal.name AS member_name,
    member_principal.type_desc AS member_type_desc
FROM sys.database_role_members AS drm
JOIN sys.database_principals AS role_principal
    ON role_principal.principal_id = drm.role_principal_id
JOIN sys.database_principals AS member_principal
    ON member_principal.principal_id = drm.member_principal_id
WHERE role_principal.name IN (N'helios_readonly', N'db_datareader', N'db_owner')
ORDER BY role_principal.name, member_principal.name;

SELECT
    s.name AS schema_name,
    owner_principal.name AS schema_owner,
    COUNT(o.object_id) AS table_or_view_count,
    CASE
        WHEN p.permission_name = N'SELECT'
         AND p.state_desc IN (N'GRANT', N'GRANT_WITH_GRANT_OPTION')
        THEN CAST(1 AS bit)
        ELSE CAST(0 AS bit)
    END AS readonly_select
FROM sys.schemas AS s
JOIN sys.database_principals AS owner_principal
    ON owner_principal.principal_id = s.principal_id
LEFT JOIN sys.objects AS o
    ON o.schema_id = s.schema_id
   AND o.type IN (N'U', N'V')
LEFT JOIN sys.database_permissions AS p
    ON p.major_id = s.schema_id
   AND p.class_desc = N'SCHEMA'
   AND p.permission_name = N'SELECT'
   AND p.grantee_principal_id = USER_ID(N'helios_readonly')
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
GROUP BY s.name, owner_principal.name, p.permission_name, p.state_desc
ORDER BY s.name;
