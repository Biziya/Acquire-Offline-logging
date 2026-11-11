/*
================================================================================
 Running every API database call as the browser user's Windows account
 (appsettings: Database:ImpersonateWindowsUser = true)
================================================================================

 What the API does with the setting on
   1. Connects with its own account (connection string as configured; the
      goal is a gMSA with Integrated Security=True, e.g. BDOM\svcAcquire$).
   2. Runs, as an ad hoc batch:
          EXECUTE AS LOGIN = N'BDOM\jsmith' WITH COOKIE INTO @cookie;
      for the user Windows authentication (Negotiate) verified.
   3. Reads / runs dbo.InsertUpdateCoreDescr_WellCAD. SQL Server checks
      permissions for BDOM\jsmith; SUSER_SNAME() = BDOM\jsmith;
      ORIGINAL_LOGIN() = the service account.
   4. REVERT WITH COOKIE before the connection returns to the pool.
   Errors 229 / 230 / 916 / 15406 / 15517 → HTTP 403 for that user.

 What SQL Server needs (PART B, commented out, for the DBA)
   B1. A login for the API's service account. It needs no data permissions
       of its own, only the right to impersonate the users.
   B2. Each user must be a server principal the service account may
       impersonate. Two ways — choose one:
         (a) RECOMMENDED: one Windows login per user, and
             GRANT IMPERSONATE ON LOGIN::[BDOM\user] TO [service account].
             Tight: the service account can become exactly these people.
             Add/remove a login when someone joins/leaves the team.
         (b) GRANT IMPERSONATE ANY LOGIN TO [service account], with
             DENY IMPERSONATE ON LOGIN::[<each privileged login>]. Users can
             then come in through an AD group login only, but the service
             account can impersonate any login not explicitly denied
             (including future admins). Use only with the security team's
             agreement.
       Verify on DEVELOPMENT that EXECUTE AS LOGIN works for a user whose
       access comes only from a group (PART C) before relying on (b).
   B3. Database permissions for the users (best through AD group logins +
       roles): SELECT on the three read objects, EXECUTE on the procedure.

 Effect on the upload procedure
   Its 'Raw core import_JSON' branch replaces @usr with SUSER_NAME(). Running
   as the user, that is now the uploader itself, so usr records the real
   person with no procedure change. usr is part of the procedure's match key:
   rows stored so far under 'userAcquire' are not updated by a new upload,
   new rows are added under the user (see UploadDataUserAuthorization.sql A3).

 PART A is read-only. PART B is commented out. PART C runs on DEVELOPMENT only.
 Replace <SERVICE ACCOUNT>, <USER> and <GROUP> first.
================================================================================
*/

USE [master];
GO

-------------------------------------------------------------------------------
-- PART A — CHECKS (read-only)
-------------------------------------------------------------------------------

-- A1. The service account login (B1).
SELECT name, type_desc, is_disabled
FROM sys.server_principals
WHERE name = N'<SERVICE ACCOUNT>';

-- A2. Whom the service account may impersonate (B2).
SELECT grantee.name AS Grantee,
       perm.permission_name,
       perm.state_desc,
       target.name AS CanImpersonate
FROM sys.server_permissions AS perm
JOIN sys.server_principals AS grantee ON grantee.principal_id = perm.grantee_principal_id
LEFT JOIN sys.server_principals AS target
       ON perm.class = 101 AND target.principal_id = perm.major_id
WHERE perm.permission_name IN (N'IMPERSONATE', N'IMPERSONATE ANY LOGIN')
ORDER BY grantee.name, target.name;

-- A3. How SQL Server sees one user: one row per login they reach the server
--     through ('permission path' = the group).
-- EXEC master.sys.xp_logininfo @acctname = N'<USER>', @option = 'all';
GO

USE [ACQMN01];
GO

-- A4. Users' database permissions on what the API touches.
SELECT pr.name AS Principal, pe.permission_name, pe.state_desc,
       OBJECT_SCHEMA_NAME(pe.major_id) + N'.' + OBJECT_NAME(pe.major_id) AS ObjectName
FROM sys.database_permissions AS pe
JOIN sys.database_principals AS pr ON pr.principal_id = pe.grantee_principal_id
WHERE pe.major_id IN (
        OBJECT_ID(N'dbo.ZOOVCH_COLLAR_LIST'),
        OBJECT_ID(N'dbo.QV_VS_LOOKUP_RO'),
        OBJECT_ID(N'MyApps.CoreDescrData'),
        OBJECT_ID(N'dbo.InsertUpdateCoreDescr_WellCAD'))
ORDER BY ObjectName, Principal;
GO

-------------------------------------------------------------------------------
-- PART B — CHANGES (commented out; review, then apply in DEVELOPMENT first)
-------------------------------------------------------------------------------
/*
 B1. The API's service account (the IIS app pool identity; a gMSA ends in $).
     It needs no database user and no data permissions.

     USE [master];
     CREATE LOGIN [<SERVICE ACCOUNT>] FROM WINDOWS;

 B2 (a). Per user — repeat for each person allowed to use the app.

     USE [master];
     CREATE LOGIN [<USER>] FROM WINDOWS;
     GRANT IMPERSONATE ON LOGIN::[<USER>] TO [<SERVICE ACCOUNT>];

 B2 (b). Alternative — only with the security team's agreement.

     USE [master];
     GRANT IMPERSONATE ANY LOGIN TO [<SERVICE ACCOUNT>];
     DENY IMPERSONATE ON LOGIN::[sa] TO [<SERVICE ACCOUNT>];
     -- …and DENY on every sysadmin / privileged login.

 B3. Database access through an AD group and roles.

     USE [master];
     CREATE LOGIN [<GROUP>] FROM WINDOWS;          -- e.g. BDOM\AcQuire_Loggers

     USE [ACQMN01];
     CREATE USER [<GROUP>] FOR LOGIN [<GROUP>];
     CREATE ROLE [AcquireLoggingReader];
     CREATE ROLE [AcquireLoggingUploader];
     GRANT SELECT ON dbo.ZOOVCH_COLLAR_LIST   TO [AcquireLoggingReader];
     GRANT SELECT ON dbo.QV_VS_LOOKUP_RO      TO [AcquireLoggingReader];
     GRANT SELECT ON MyApps.CoreDescrData     TO [AcquireLoggingReader];
     GRANT EXECUTE ON dbo.InsertUpdateCoreDescr_WellCAD TO [AcquireLoggingUploader];
     ALTER ROLE [AcquireLoggingReader]   ADD MEMBER [<GROUP>];
     ALTER ROLE [AcquireLoggingUploader] ADD MEMBER [<GROUP>];

     -- The procedure's INSERT into MyApps.CoreDescrData must still pass
     -- (ownership chain or certificate signing: see UploadDataPermissions.sql),
     -- now checked against the user instead of userAcquire.
*/
GO

-------------------------------------------------------------------------------
-- PART C — TEST (DEVELOPMENT only; run as a DBA)
-- Does exactly what the API does, then shows who SQL Server sees.
-------------------------------------------------------------------------------
/*
EXECUTE AS LOGIN = N'<SERVICE ACCOUNT>';          -- become the API
    DECLARE @cookie varbinary(8000);
    EXECUTE AS LOGIN = N'<USER>' WITH COOKIE INTO @cookie;   -- the API's step 2
        SELECT SUSER_SNAME() AS RunsAs,           -- expected: <USER>
               ORIGINAL_LOGIN() AS ConnectedAs,   -- expected: you (the DBA)
               HAS_PERMS_BY_NAME(N'MyApps.CoreDescrData', N'OBJECT', N'SELECT') AS CanRead,
               HAS_PERMS_BY_NAME(N'dbo.InsertUpdateCoreDescr_WellCAD', N'OBJECT', N'EXECUTE') AS CanUpload;
    REVERT WITH COOKIE = @cookie;
REVERT;
SELECT SUSER_SNAME() AS BackTo;                   -- expected: you
*/
