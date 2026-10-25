/*
================================================================================
 Upload Data — SQL Server error 229 — diagnostics and fix options for the DBA
================================================================================

 Error from POST /api/upload-data (logged by UploadDataController):
   The INSERT permission was denied on the object 'CoreDescrData',
   database 'ACQMN01', schema 'MyApps'.            (Number 229, State 5, Class 14)
   raised inside procedure InsertUpdateCoreDescr_WellCAD

 What the application does (and only this):
   connection  Data Source=BMNULAADB02; database ACQMN01 (DefaultConnection's
               Initial Catalog; CoreDescrData:Database is not set);
               SQL login userAcquire (appsettings.json, CoreDescrData:
               UseWindowsAuthentication = false). On IIS the Windows-auth
               alternative fails: the app pool (ApplicationPoolIdentity) reaches
               SQL Server as BDOM\BMNDULAAS01$, which has no login (error 18456).
   call        EXEC dbo.InsertUpdateCoreDescr_WellCAD
                   @Action = 'Raw core import_JSON', @Hole, @usr, @fileName, @str_json
               once per uploaded file. No INSERT/UPDATE/DELETE is sent by the app.

 What 229 means here:
   The EXECUTE check on the procedure PASSED (otherwise 229 would name the
   procedure). The procedure then ran its INSERT into MyApps.CoreDescrData and
   SQL Server checked that INSERT against the caller (userAcquire). That only
   happens when the ownership chain from dbo.InsertUpdateCoreDescr_WellCAD to
   MyApps.CoreDescrData is broken:
     - the MyApps schema / table has a different owner than the dbo procedure, or
     - the INSERT runs as dynamic SQL (EXEC(@sql) / sp_executesql), or
     - the procedure writes to another database (cross-database), or
     - the caller has an explicit DENY (only matters once the chain is broken).
   PART A shows which one applies.

 PART A is READ-ONLY (SELECTs, EXECUTE AS LOGIN ... REVERT). PART B is
 commented out; nothing in it runs until a DBA chooses and executes it.

 This script targets ACQMN01, the upload database (an earlier 229 from
 ACQMN01_DEV shows the same login was refused there too).
================================================================================
*/

-------------------------------------------------------------------------------
-- PART A — DIAGNOSTICS (read-only; run as a DBA in SSMS)
-------------------------------------------------------------------------------

-- A0. Destination: which database holds the procedure and the table?
SELECT
    db.name                                                            AS DatabaseName,
    OBJECT_ID(QUOTENAME(db.name) + N'.dbo.InsertUpdateCoreDescr_WellCAD') AS ProcedureId,
    OBJECT_ID(QUOTENAME(db.name) + N'.MyApps.CoreDescrData')           AS TableId
FROM sys.databases AS db
WHERE db.name IN (N'ACQMN01', N'ACQMN01_DEV');
GO

USE [ACQMN01];
GO

-- A1. The API's identity in this database (EXECUTE AS LOGIN reproduces it).
EXECUTE AS LOGIN = N'userAcquire';

SELECT
    DB_NAME()         AS DatabaseName,
    ORIGINAL_LOGIN()  AS OriginalLogin,   -- the DBA in this session; the API sees userAcquire
    SUSER_SNAME()     AS SqlLogin,
    USER_NAME()       AS DatabaseUser;

SELECT
    HAS_PERMS_BY_NAME(N'dbo.InsertUpdateCoreDescr_WellCAD', N'OBJECT', N'EXECUTE') AS CanExecuteProcedure,
    HAS_PERMS_BY_NAME(N'MyApps.CoreDescrData', N'OBJECT', N'INSERT') AS CanInsertDirectly,
    HAS_PERMS_BY_NAME(N'MyApps.CoreDescrData', N'OBJECT', N'UPDATE') AS CanUpdateDirectly,
    HAS_PERMS_BY_NAME(N'MyApps.CoreDescrData', N'OBJECT', N'SELECT') AS CanSelectDirectly;
-- Expected under the approved model: CanExecuteProcedure = 1 and the three
-- direct permissions = 0. The procedure must then carry the table access itself.

REVERT;
GO

-- A2. Ownership chain: owner of the procedure vs owner of the table.
--     The chain is intact only when both rows show the same OwnerUser.
SELECT
    CASE o.type WHEN 'P' THEN N'procedure' ELSE N'table' END AS ObjectType,
    s.name + N'.' + o.name        AS ObjectName,
    owner_user.name               AS OwnerUser,
    SUSER_SNAME(owner_user.sid)   AS OwnerLogin
FROM sys.objects AS o
JOIN sys.schemas AS s ON s.schema_id = o.schema_id
JOIN sys.database_principals AS owner_user
  ON owner_user.principal_id = COALESCE(o.principal_id, s.principal_id)
WHERE o.object_id IN (OBJECT_ID(N'dbo.InsertUpdateCoreDescr_WellCAD'),
                      OBJECT_ID(N'MyApps.CoreDescrData'))
ORDER BY ObjectType;

SELECT
    s.name                        AS SchemaName,
    owner_user.name               AS SchemaOwner
FROM sys.schemas AS s
JOIN sys.database_principals AS owner_user ON owner_user.principal_id = s.principal_id
WHERE s.name IN (N'dbo', N'MyApps');

-- A3. Execution context and signatures of the procedure.
--     ExecuteAs = CALLER: everything outside an intact ownership chain is
--     checked against userAcquire.
SELECT
    CASE
        WHEN m.execute_as_principal_id IS NULL THEN N'CALLER'
        WHEN m.execute_as_principal_id = -2    THEN N'OWNER'
        ELSE USER_NAME(m.execute_as_principal_id)
    END                                                   AS ExecuteAs,
    (SELECT COUNT(*) FROM sys.crypt_properties AS cp
      WHERE cp.major_id = m.object_id)                    AS Signatures
FROM sys.sql_modules AS m
WHERE m.object_id = OBJECT_ID(N'dbo.InsertUpdateCoreDescr_WellCAD');

-- A4. How the procedure reaches its tables.
--     referenced_database_name not NULL = cross-database access.
SELECT DISTINCT referenced_database_name, referenced_schema_name, referenced_entity_name
FROM sys.sql_expression_dependencies
WHERE referencing_id = OBJECT_ID(N'dbo.InsertUpdateCoreDescr_WellCAD');

--     Dynamic SQL never uses ownership chaining.
SELECT
    CASE WHEN def LIKE N'%sp_executesql%' OR def LIKE N'%EXEC(%' OR def LIKE N'%EXEC (%'
              OR def LIKE N'%EXECUTE(%' OR def LIKE N'%EXECUTE (%'
         THEN 1 ELSE 0 END AS UsesDynamicSql
FROM (SELECT OBJECT_DEFINITION(OBJECT_ID(N'dbo.InsertUpdateCoreDescr_WellCAD')) AS def) AS d;
GO

-- A5. Explicit GRANT / DENY affecting the API user, and its role memberships.
--     Look for DENY rows and db_denydatawriter / db_denydatareader.
DECLARE @ApiUser sysname =
    (SELECT name FROM sys.database_principals WHERE sid = SUSER_SID(N'userAcquire'));

SELECT @ApiUser AS ApiUser;

SELECT role_user.name AS RoleName
FROM sys.database_role_members AS rm
JOIN sys.database_principals AS member_user ON member_user.principal_id = rm.member_principal_id
JOIN sys.database_principals AS role_user ON role_user.principal_id = rm.role_principal_id
WHERE member_user.name = @ApiUser;

SELECT
    grantee.name          AS Grantee,
    perm.state_desc       AS State,
    perm.permission_name  AS Permission,
    CASE perm.class
        WHEN 1 THEN OBJECT_SCHEMA_NAME(perm.major_id) + N'.' + OBJECT_NAME(perm.major_id)
        WHEN 3 THEN N'SCHEMA::' + SCHEMA_NAME(perm.major_id)
        ELSE N'(database)'
    END                   AS Securable
FROM sys.database_permissions AS perm
JOIN sys.database_principals AS grantee ON grantee.principal_id = perm.grantee_principal_id
WHERE ((perm.class = 1 AND perm.major_id IN (OBJECT_ID(N'MyApps.CoreDescrData'),
                                             OBJECT_ID(N'dbo.InsertUpdateCoreDescr_WellCAD')))
    OR (perm.class = 3 AND perm.major_id IN (SCHEMA_ID(N'MyApps'), SCHEMA_ID(N'dbo')))
    OR (perm.class = 0 AND perm.permission_name IN (N'EXECUTE', N'INSERT', N'UPDATE', N'SELECT')))
  AND (grantee.name IN (@ApiUser, N'public')
       OR grantee.principal_id IN (SELECT rm.role_principal_id
                                   FROM sys.database_role_members AS rm
                                   JOIN sys.database_principals AS u
                                     ON u.principal_id = rm.member_principal_id
                                   WHERE u.name = @ApiUser))
ORDER BY Securable, Grantee, Permission;
GO

/*
 Reading the results
 -------------------
 A2 owners differ (typical: schema MyApps owned by a user other than dbo)
     -> BROKEN OWNERSHIP CHAIN. Fix: B1 (recommended) or B2.
 A4 UsesDynamicSql = 1
     -> chaining can never apply. Fix: B1.
 A4 shows another database
     -> cross-database access; chains stop at the database boundary. Fix: B1
        done across databases (ask for the cross-database signing variant);
        do NOT enable cross-db chaining or TRUSTWORTHY.
 A5 shows DENY INSERT/UPDATE/SELECT, or membership of db_denydatawriter
     -> also remove that DENY (B0); a signature does not override a caller's DENY.
 A1 CanExecuteProcedure = 0
     -> not this error, but needed: GRANT EXECUTE (in B1).
*/

-------------------------------------------------------------------------------
-- PART B — FIX OPTIONS (commented out; a DBA chooses ONE and runs it)
-------------------------------------------------------------------------------
-- Not acceptable: sysadmin, db_owner, db_datawriter, schema-wide grants to the
-- application, cross-db chaining, TRUSTWORTHY ON. EXECUTE AS OWNER is not
-- proposed: it would also change SUSER_NAME(), which the procedure writes to
-- the usr column and uses in its duplicate-matching key.

/* ---- B0. Only if A5 shows an explicit DENY -------------------------------
USE [ACQMN01];
REVOKE INSERT ON OBJECT::[MyApps].[CoreDescrData] FROM [<ApiUser from A5>];   -- removes a DENY INSERT
-- or: ALTER ROLE [db_denydatawriter] DROP MEMBER [<ApiUser from A5>];
------------------------------------------------------------------------------ */

/* ---- B1. RECOMMENDED: sign the procedure (application keeps EXECUTE only) --
-- The table rights belong to a certificate user that cannot log in; they apply
-- only while this exact procedure runs. userAcquire gets no table access.
-- An ALTER PROCEDURE drops the signature: re-sign after every change.
-- Grant only what the procedure's Raw core import_JSON branch does: SELECT,
-- INSERT, UPDATE (add DELETE only if its definition has one; repeat for any
-- other table A4 lists that it writes).
USE [ACQMN01];
CREATE CERTIFICATE [UploadDataProcSigning]
    ENCRYPTION BY PASSWORD = N'<strong password>'
    WITH SUBJECT = N'Signs dbo.InsertUpdateCoreDescr_WellCAD (MyApps.CoreDescrData access)',
         EXPIRY_DATE = '2036-12-31';
CREATE USER [UploadDataProcSigner] FROM CERTIFICATE [UploadDataProcSigning];
GRANT SELECT, INSERT, UPDATE ON OBJECT::[MyApps].[CoreDescrData] TO [UploadDataProcSigner];
ADD SIGNATURE TO OBJECT::[dbo].[InsertUpdateCoreDescr_WellCAD]
    BY CERTIFICATE [UploadDataProcSigning] WITH PASSWORD = N'<strong password>';
-- Only if A1 showed CanExecuteProcedure = 0:
-- GRANT EXECUTE ON OBJECT::[dbo].[InsertUpdateCoreDescr_WellCAD] TO [<ApiUser from A5>];
------------------------------------------------------------------------------ */

/* ---- B2. Repair the ownership chain (only after reviewing side effects) ----
-- Makes dbo the owner of the MyApps schema, so every dbo procedure can reach
-- every MyApps object without table permissions, and the current owner loses
-- its implicit rights. Review all other users of the MyApps schema first.
USE [ACQMN01];
ALTER AUTHORIZATION ON SCHEMA::[MyApps] TO [dbo];
-- (or, narrower, only this table:)
-- ALTER AUTHORIZATION ON OBJECT::[MyApps].[CoreDescrData] TO SCHEMA OWNER;   -- if the table has its own owner
------------------------------------------------------------------------------ */

/* ---- B3. Direct grants to userAcquire (simplest; outside the approved model)
-- userAcquire gets table access of its own, usable outside the procedure too,
-- which the approved model ("the application login may only execute the
-- procedure") does not allow. Needs sign-off from whoever owns that model;
-- otherwise use B1, which needs the same application configuration.
-- Table-level rather than SCHEMA::[MyApps]: SELECT is also what Data Viewer
-- needs. Repeat for any other MyApps table A4 lists.
USE [ACQMN01];
GRANT SELECT, INSERT, UPDATE ON OBJECT::[MyApps].[CoreDescrData] TO [<ApiUser from A5>];
-- Only if A1 showed CanExecuteProcedure = 0:
-- GRANT EXECUTE ON OBJECT::[dbo].[InsertUpdateCoreDescr_WellCAD] TO [<ApiUser from A5>];
------------------------------------------------------------------------------ */

-------------------------------------------------------------------------------
-- PART C — VERIFY AFTER THE FIX (read-only; run after the test uploads)
-------------------------------------------------------------------------------
/*
SELECT HOLEID, PROJECTCODE, [FROM], [TO], PRIORITY, NAME, VALUE, COMMENT_VALUE, usr
FROM [ACQMN01].[MyApps].[CoreDescrData]
WHERE HOLEID = 'GTZO_0001_1'
ORDER BY [FROM], [TO], NAME;

-- Duplicate check: must return no rows after uploading the same file twice.
SELECT HOLEID, PROJECTCODE, [FROM], [TO], PRIORITY, NAME, usr, COUNT(*) AS Copies
FROM [ACQMN01].[MyApps].[CoreDescrData]
WHERE HOLEID = 'GTZO_0001_1'
GROUP BY HOLEID, PROJECTCODE, [FROM], [TO], PRIORITY, NAME, usr
HAVING COUNT(*) > 1;

-- Nothing else touched: other holes' row count unchanged before/after uploads.
SELECT COUNT(*) AS OtherRows
FROM [ACQMN01].[MyApps].[CoreDescrData]
WHERE HOLEID <> 'GTZO_0001_1';
*/
