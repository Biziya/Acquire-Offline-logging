/*
================================================================================
 Upload Data — store the uploader's Windows account in usr, not 'userAcquire'
================================================================================

 Root cause (why usr = 'userAcquire')
   - The frontend sends no user name. The API takes the uploader from Windows
     authentication (DOMAIN\user, verified by IIS / Active Directory) and
     passes it as @usr varchar(50) to dbo.InsertUpdateCoreDescr_WellCAD.
   - In the 'Raw core import_JSON' branch, the procedure OVERWRITES @usr with
     SUSER_NAME(): the SQL login the API connects as, which is 'userAcquire'.
     Nothing in the frontend, the JSON file, the API or the config assigns
     'userAcquire'; it comes from that one line.

 Why the procedure has to change (the only place the value is lost)
   The API already sends the correct value. Without this change, the only
   other way is to make SUSER_NAME() the user itself:
   Database:ImpersonateWindowsUser = true (EXECUTE AS LOGIN, see
   WindowsUserImpersonation.sql), which needs a SQL login and IMPERSONATE
   permission per user. This script is the smaller change.

 The change (PART B): keep @usr when the caller supplies it; fall back to
 the caller's login only when it is empty (e.g. an EXEC from SSMS without
 @usr). Nothing else in the procedure changes. Other actions are untouched.

 Decide before applying
   - usr is part of the procedure's match key (HOLEID, PROJECTCODE, FROM, TO,
     PRIORITY, NAME, usr). After the change, re-uploading a drillhole stored
     under 'userAcquire' ADDS rows under the real user instead of updating
     the old ones. A3 lists those drillholes. Changing the match key is a
     business-rule decision and is NOT part of this script.
   - The procedure now trusts @usr. The API only ever sends the verified
     Windows user, but anyone holding the userAcquire password could call
     the procedure directly with another name. Keep that password out of
     source control (it is in appsettings.json today) and restrict who has
     it. For an authorization check on top (uploaders' AD group, error
     51001), see UploadDataUserAuthorization.sql.

 PART A is read-only. PART B is commented out: apply it in DEVELOPMENT first.
 PART C verifies on DEVELOPMENT; every test rolls back.
================================================================================
*/

USE [ACQMN01];
GO

-------------------------------------------------------------------------------
-- PART A — CHECKS (read-only)
-------------------------------------------------------------------------------

-- A1. The line(s) that overwrite @usr. Expect something like
--     SELECT @usr = SUSER_NAME()   or   SET @usr = SUSER_NAME()
SELECT value AS ProcedureLine
FROM STRING_SPLIT(
        REPLACE(OBJECT_DEFINITION(OBJECT_ID(N'dbo.InsertUpdateCoreDescr_WellCAD')), CHAR(13), N''),
        CHAR(10))
WHERE value LIKE N'%@usr%'
   OR value LIKE N'%SUSER_%'
   OR value LIKE N'%SYSTEM_USER%'
   OR value LIKE N'%ORIGINAL_LOGIN%';

-- A2. usr must hold 'DOMAIN\user' (the API rejects names over 50 characters).
SELECT c.name AS ColumnName, t.name AS DataType, c.max_length AS MaxBytes
FROM sys.columns AS c
JOIN sys.types AS t ON t.user_type_id = c.user_type_id
WHERE c.object_id = OBJECT_ID(N'MyApps.CoreDescrData')
  AND c.name = N'usr';

-- A3. What usr holds today, per drillhole.
SELECT usr, COUNT(DISTINCT HOLEID) AS Drillholes, COUNT(*) AS Rows
FROM [MyApps].[CoreDescrData]
GROUP BY usr
ORDER BY Rows DESC;
GO

-------------------------------------------------------------------------------
-- PART B — CHANGE (commented out; apply in DEVELOPMENT first)
-------------------------------------------------------------------------------
/*
 Easiest: run UploadDataUsrFix.Apply.sql (preview with @Apply = 0, then
 @Apply = 1). It makes exactly the change below and stops without changing
 anything if the procedure does not look as expected. By hand instead:

 In SSMS: Object Explorer → ACQMN01 → Programmability → Stored Procedures →
 dbo.InsertUpdateCoreDescr_WellCAD → Modify. In the 'Raw core import_JSON'
 branch, replace the line A1 found, e.g.

     SELECT @usr = SUSER_NAME();

 with:

     -- The uploader, verified by the API (Windows authentication). Only a
     -- call without @usr (e.g. from SSMS) records the caller's own login.
     SET @usr = COALESCE(NULLIF(LTRIM(RTRIM(@usr)), ''), SUSER_SNAME());

 then Execute (ALTER PROCEDURE). If the procedure is signed with a
 certificate (UploadDataPermissions.sql, option B1), ALTER drops the
 signature: re-sign it afterwards.
*/
GO

-------------------------------------------------------------------------------
-- PART C — VERIFY (DEVELOPMENT only; rolls back)
-------------------------------------------------------------------------------
/*
DECLARE @Json nvarchar(max) = N'<str_json of a small valid upload: copy it from SQLTests>';
DECLARE @Hole varchar(20)   = '<drillhole in @Json>';

-- C1. @usr supplied (what the API does): usr = that user.
BEGIN TRAN;
EXEC dbo.InsertUpdateCoreDescr_WellCAD
    @Action = 'Raw core import_JSON', @Hole = @Hole,
    @usr = 'BDOM\<your user>', @fileName = 'usr-test.json', @str_json = @Json;
SELECT DISTINCT usr FROM [MyApps].[CoreDescrData]
WHERE HOLEID = @Hole AND FileName = 'usr-test.json';    -- expect BDOM\<your user>
ROLLBACK;

-- C2. No @usr (manual call): usr = your own login.
BEGIN TRAN;
EXEC dbo.InsertUpdateCoreDescr_WellCAD
    @Action = 'Raw core import_JSON', @Hole = @Hole,
    @usr = NULL, @fileName = 'usr-test.json', @str_json = @Json;
SELECT DISTINCT usr FROM [MyApps].[CoreDescrData]
WHERE HOLEID = @Hole AND FileName = 'usr-test.json';    -- expect SUSER_SNAME()
ROLLBACK;

-- C3. After a real upload through the web app (development):
-- SELECT TOP (100) HOLEID, [FROM], [TO], NAME, usr, FileName
-- FROM [MyApps].[CoreDescrData]
-- WHERE HOLEID = '<drillhole>'
-- ORDER BY [FROM], [TO], NAME;
-- usr must be 'BDOM\<uploader>' (the name in the sidebar), not 'userAcquire'.
*/
