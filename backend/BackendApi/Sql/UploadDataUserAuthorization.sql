/*
================================================================================
 Upload Data — SQL Server authorizes the uploader (AD group) and records them
================================================================================

 What the API does now
   - POST /api/upload-data requires Windows Integrated Authentication
     (Negotiate). The verified "DOMAIN\user" of the browser user is sent as
     @usr varchar(50). Nothing from the file or the form is used as a name.
   - The SQL connection is unchanged: SQL login userAcquire. No impersonation,
     no delegation; SQL Server sees userAcquire and receives the uploader in @usr.
   - EXEC runs inside a transaction; any error rolls everything back.
   - Error 51001 from the procedure = "not authorized": the API answers 403
     "<user> is not authorized to upload data." Any other error: 500.

 What this script changes (PART B, commented out, for the DBA)
   In dbo.InsertUpdateCoreDescr_WellCAD, action 'Raw core import_JSON':
     1. stop replacing @usr with SUSER_NAME(), so usr records the uploader;
     2. before the first INSERT/UPDATE, check that @usr is a member of the
        uploaders' AD group (xp_logininfo, nested groups included), else
        THROW 51001 — nothing is inserted.

 Decide before applying
   - <UPLOADERS GROUP>: the AD group allowed to upload (e.g. BDOM\AcQuire_Uploaders).
     Left as a placeholder, no one is authorized (fail closed).
   - usr is part of the procedure's match key (HOLEID, PROJECTCODE, FROM, TO,
     PRIORITY, NAME, usr). After the change, re-uploading a drillhole stored
     under 'userAcquire' adds rows under the real user instead of updating
     those rows. A3 lists them. Changing the match key is a business-rule
     change and is NOT part of this script.
   - The check trusts @usr as the API verified it. Anyone holding the
     userAcquire password could call the procedure with another name; keep
     that password out of source control (see backend README).

 PART A is read-only. PART B is commented out. PART C runs on DEVELOPMENT only.
================================================================================
*/

USE [ACQMN01];
GO

-------------------------------------------------------------------------------
-- PART A — CHECKS (read-only)
-------------------------------------------------------------------------------

-- A1. Every line of the procedure that sets or uses @usr / the login. B1
--     replaces the line that assigns SUSER_NAME() to @usr.
SELECT value AS ProcedureLine
FROM STRING_SPLIT(
        REPLACE(OBJECT_DEFINITION(OBJECT_ID(N'dbo.InsertUpdateCoreDescr_WellCAD')), CHAR(13), N''),
        CHAR(10))
WHERE value LIKE N'%@usr%'
   OR value LIKE N'%SUSER_%'
   OR value LIKE N'%SYSTEM_USER%'
   OR value LIKE N'%ORIGINAL_LOGIN%'
   OR value LIKE N'%XACT_ABORT%';

-- A2. usr must hold 'DOMAIN\user' (up to 50 characters).
SELECT c.name AS ColumnName, t.name AS DataType, c.max_length AS MaxBytes
FROM sys.columns AS c
JOIN sys.types AS t ON t.user_type_id = c.user_type_id
WHERE c.object_id = OBJECT_ID(N'MyApps.CoreDescrData')
  AND c.name = N'usr';

-- A3. Rows stored so far under the SQL login (see "Decide before applying").
SELECT HOLEID, COUNT(*) AS RowsAsSqlLogin
FROM [MyApps].[CoreDescrData]
WHERE usr = N'userAcquire'
GROUP BY HOLEID
ORDER BY HOLEID;

-- A4. The uploaders' group must exist as a Windows group login, so that
--     xp_logininfo reports it as a permission path. It needs no database
--     access.
SELECT name, type_desc, is_disabled
FROM sys.server_principals
WHERE name = N'<UPLOADERS GROUP>';

-- A5. How SQL Server sees one user (run as a DBA): one row per login the user
--     reaches SQL Server through; 'permission path' is the group.
-- EXEC master.sys.xp_logininfo @acctname = N'BDOM\<someone>', @option = 'all';

-- A6. Can userAcquire run xp_logininfo? (needs B2)
-- EXECUTE AS LOGIN = N'userAcquire';
-- SELECT HAS_PERMS_BY_NAME(N'master.sys.xp_logininfo', N'OBJECT', N'EXECUTE') AS CanCheckGroups;
-- REVERT;
GO

-------------------------------------------------------------------------------
-- PART B — CHANGES (commented out; review, then apply in DEVELOPMENT first)
-------------------------------------------------------------------------------
/*
 B0. The uploaders' group as a login (skip if A4 returned it). No database
     user, no roles: it only lets xp_logininfo resolve membership.

     USE [master];
     CREATE LOGIN [<UPLOADERS GROUP>] FROM WINDOWS;

 B1. In dbo.InsertUpdateCoreDescr_WellCAD (SSMS: Modify), branch
     'Raw core import_JSON', replace the line A1 shows assigning @usr, e.g.
         SELECT @usr = SUSER_NAME();
     with the block below, placed BEFORE the branch's first INSERT/UPDATE.
     Keep other actions' behaviour as it is.

        -- The uploader: verified by the API (Windows authentication). A call
        -- without @usr (e.g. from SSMS) checks the caller's own login.
        SET @usr = COALESCE(NULLIF(LTRIM(RTRIM(@usr)), ''), SUSER_SNAME());

        DECLARE @UploaderGroup sysname = N'<UPLOADERS GROUP>';
        DECLARE @Paths TABLE (
            account_name      sysname,
            type              char(8),
            privilege         char(9),
            mapped_login_name sysname,
            permission_path   sysname NULL);

        BEGIN TRY
            INSERT INTO @Paths
            EXEC master.sys.xp_logininfo @acctname = @usr, @option = 'all';
        END TRY
        BEGIN CATCH
            -- 15404: not a Windows account the domain knows (e.g. a SQL login)
            -- → not authorized. Anything else is a real failure.
            IF ERROR_NUMBER() <> 15404 THROW;
        END CATCH;

        IF NOT EXISTS (SELECT 1 FROM @Paths WHERE permission_path = @UploaderGroup)
            THROW 51001, N'The uploading user is not authorized.', 1;

 B2. Let the procedure run xp_logininfo as userAcquire (EXECUTE only):

     USE [master];
     IF DATABASE_PRINCIPAL_ID(N'userAcquire') IS NULL
         CREATE USER [userAcquire] FOR LOGIN [userAcquire];
     GRANT EXECUTE ON sys.xp_logininfo TO [userAcquire];

     If the procedure is signed instead (UploadDataPermissions.sql, option B1):
     ALTER PROCEDURE drops the signature; re-sign it after B1.

 B3. Decide about the rows A3 lists before users re-upload those drillholes.
*/

-------------------------------------------------------------------------------
-- PART C — VERIFY (DEVELOPMENT database only; every test rolls back)
-------------------------------------------------------------------------------
/*
DECLARE @Json nvarchar(max) = N'<str_json of a small valid upload: copy it from SQLTests>';
DECLARE @Hole varchar(20)   = '<drillhole in @Json>';
DECLARE @Before int = (SELECT COUNT(*) FROM [MyApps].[CoreDescrData] WHERE HOLEID = @Hole);

-- C1. Not in the group: error 51001, no rows.
BEGIN TRAN;
BEGIN TRY
    EXEC dbo.InsertUpdateCoreDescr_WellCAD
        @Action = 'Raw core import_JSON', @Hole = @Hole,
        @usr = 'BDOM\<someone not in the group>', @fileName = 'auth-test.json', @str_json = @Json;
    SELECT 'FAIL: not rejected' AS Result;
END TRY
BEGIN CATCH
    SELECT ERROR_NUMBER() AS ErrorNumber, ERROR_MESSAGE() AS Message;   -- expect 51001
END CATCH;
SELECT COUNT(*) - @Before AS RowsAdded FROM [MyApps].[CoreDescrData] WHERE HOLEID = @Hole; -- expect 0
IF @@TRANCOUNT > 0 ROLLBACK;

-- C2. In the group: rows stored with usr = that user.
BEGIN TRAN;
EXEC dbo.InsertUpdateCoreDescr_WellCAD
    @Action = 'Raw core import_JSON', @Hole = @Hole,
    @usr = 'BDOM\<someone in the group>', @fileName = 'auth-test.json', @str_json = @Json;
SELECT DISTINCT usr FROM [MyApps].[CoreDescrData] WHERE HOLEID = @Hole AND FileName = 'auth-test.json';
ROLLBACK;

-- C3. After a real upload through the frontend (development):
-- SELECT TOP (50) HOLEID, [FROM], [TO], NAME, VALUE, usr, FileName
-- FROM [MyApps].[CoreDescrData] WHERE HOLEID = '<drillhole>' ORDER BY [FROM], [TO], NAME;
-- usr must be 'BDOM\<uploader>', not 'userAcquire' and not 'BDOM\BMNDULAAS01$'.
*/
