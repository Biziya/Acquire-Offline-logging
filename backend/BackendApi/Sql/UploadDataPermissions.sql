/*
================================================================================
 Upload Data — SQL Server error 229 (INSERT permission denied on
 [ACQMN01_DEV].[MyApps].[CoreDescrData]) — diagnostics and fix options
================================================================================

 PART A is READ-ONLY: SELECTs and an EXECUTE AS LOGIN / REVERT context switch.
 It changes no data, permissions or objects.

 PART B is entirely commented out. Nothing in it runs until a DBA chooses one
 option, fills in the placeholders and executes it deliberately.

 Run in SSMS as a DBA connected to BMNULAADB02. Set these two values first:
   @ApiLogin  = the SQL login in DefaultConnection (appsettings.json: User ID).
   Procedure database = the Initial Catalog in DefaultConnection. The API runs
                the procedure that exists in THAT database. In this repository
                it is ACQMN01, not ACQMN01_DEV.
================================================================================
*/

-------------------------------------------------------------------------------
-- PART A — DIAGNOSTICS (read-only)
-------------------------------------------------------------------------------

USE [ACQMN01];   -- << the Initial Catalog of DefaultConnection
GO

-- A1. The identity the API really runs as, in the database it connects to.
--     EXECUTE AS LOGIN reproduces the API's security context for this session.
EXECUTE AS LOGIN = N'userAcquire';   -- << DefaultConnection User ID

SELECT
    DB_NAME()         AS CurrentDatabase,
    SUSER_SNAME()     AS LoginName,
    ORIGINAL_LOGIN()  AS OriginalLogin,   -- the DBA here; the API itself sees userAcquire
    USER_NAME()       AS DatabaseUser,
    CURRENT_USER      AS CurrentDatabaseUser;

-- Expect CanExecute = 1: error 229 names the TABLE, so the EXECUTE check on
-- the procedure already passed (otherwise the error would name the procedure).
SELECT HAS_PERMS_BY_NAME(N'dbo.InsertUpdateCoreDescr_WellCAD', N'OBJECT', N'EXECUTE') AS CanExecute;

REVERT;
GO

-- A2. Where the procedure lives, who owns it, and whether it switches context.
--     ExecuteAs = CALLER means every permission check NOT covered by an intact
--     ownership chain is made against the API login.
SELECT
    DB_NAME()                                             AS ProcedureDatabase,
    s.name + N'.' + p.name                                AS ProcedureName,
    owner_user.name                                       AS OwnerUser,
    SUSER_SNAME(owner_user.sid)                           AS OwnerLogin,
    CASE
        WHEN m.execute_as_principal_id IS NULL THEN N'CALLER'
        WHEN m.execute_as_principal_id = -2    THEN N'OWNER'
        ELSE USER_NAME(m.execute_as_principal_id)
    END                                                   AS ExecuteAs,
    (SELECT COUNT(*) FROM sys.crypt_properties cp
      WHERE cp.major_id = p.object_id)                    AS Signatures
FROM sys.procedures AS p
JOIN sys.schemas AS s ON s.schema_id = p.schema_id
JOIN sys.sql_modules AS m ON m.object_id = p.object_id
JOIN sys.database_principals AS owner_user
  ON owner_user.principal_id = COALESCE(p.principal_id, s.principal_id)
WHERE p.object_id = OBJECT_ID(N'dbo.InsertUpdateCoreDescr_WellCAD');

-- A3. Which tables the procedure touches, and how.
--     A non-NULL referenced_database_name (ACQMN01_DEV) = CROSS-DATABASE access.
--     Tables reached only through dynamic SQL do not appear here; see A4.
SELECT DISTINCT
    referenced_database_name,
    referenced_schema_name,
    referenced_entity_name
FROM sys.sql_expression_dependencies
WHERE referencing_id = OBJECT_ID(N'dbo.InsertUpdateCoreDescr_WellCAD');

-- A4. Dynamic SQL in the procedure. Ownership chaining never applies to
--     EXEC(@sql) / sp_executesql, so those statements are always checked
--     against the API login.
SELECT
    CASE WHEN def LIKE N'%sp_executesql%' OR def LIKE N'%EXEC(%' OR def LIKE N'%EXEC (%'
              OR def LIKE N'%EXECUTE(%' OR def LIKE N'%EXECUTE (%'
         THEN 1 ELSE 0 END                                AS UsesDynamicSql,
    CASE WHEN def LIKE N'%ACQMN01_DEV%' THEN 1 ELSE 0 END AS NamesAcqmn01Dev
FROM (SELECT OBJECT_DEFINITION(OBJECT_ID(N'dbo.InsertUpdateCoreDescr_WellCAD')) AS def) AS d;
GO

-- A5. Owner of the target table (through its schema) in ACQMN01_DEV.
--     Same database: the chain is intact only if this owner = the procedure owner (A2).
SELECT
    s.name + N'.' + t.name        AS TableName,
    owner_user.name               AS OwnerUser,
    SUSER_SNAME(owner_user.sid)   AS OwnerLogin
FROM [ACQMN01_DEV].sys.tables AS t
JOIN [ACQMN01_DEV].sys.schemas AS s ON s.schema_id = t.schema_id
JOIN [ACQMN01_DEV].sys.database_principals AS owner_user
  ON owner_user.principal_id = COALESCE(t.principal_id, s.principal_id)
WHERE s.name = N'MyApps' AND t.name = N'CoreDescrData';

-- A6. Cross-database ownership chaining (off by default, and should stay off).
SELECT name, is_db_chaining_on, is_trustworthy_on, SUSER_SNAME(owner_sid) AS DatabaseOwner
FROM sys.databases
WHERE name IN (N'ACQMN01', N'ACQMN01_DEV');

SELECT CAST(value_in_use AS int) AS ServerCrossDbChaining
FROM sys.configurations
WHERE name = N'cross db ownership chaining';
GO

-- A7. The API login in ACQMN01_DEV: its user, role memberships, and every
--     GRANT / DENY that applies to the table (object, schema or database level).
--     Look especially for DENY rows and for db_denydatawriter / db_denydatareader.
USE [ACQMN01_DEV];
GO

DECLARE @ApiUser sysname =
    (SELECT name FROM sys.database_principals WHERE sid = SUSER_SID(N'userAcquire'));   -- << login

SELECT @ApiUser AS ApiUserInAcqmn01Dev;   -- NULL = no user; access would be via guest

SELECT role_user.name AS RoleName
FROM sys.database_role_members AS rm
JOIN sys.database_principals AS member_user ON member_user.principal_id = rm.member_principal_id
JOIN sys.database_principals AS role_user ON role_user.principal_id = rm.role_principal_id
WHERE member_user.name = @ApiUser;

SELECT
    grantee.name        AS Grantee,
    perm.state_desc     AS State,
    perm.permission_name,
    perm.class_desc     AS Scope,
    CASE perm.class
        WHEN 1 THEN OBJECT_SCHEMA_NAME(perm.major_id) + N'.' + OBJECT_NAME(perm.major_id)
        WHEN 3 THEN N'SCHEMA::' + SCHEMA_NAME(perm.major_id)
        ELSE N'(database)'
    END                 AS Securable
FROM sys.database_permissions AS perm
JOIN sys.database_principals AS grantee ON grantee.principal_id = perm.grantee_principal_id
WHERE (perm.class = 1 AND perm.major_id = OBJECT_ID(N'MyApps.CoreDescrData'))
   OR (perm.class = 3 AND perm.major_id = SCHEMA_ID(N'MyApps'))
   OR (perm.class = 0 AND perm.permission_name IN (N'INSERT', N'UPDATE', N'SELECT', N'DELETE', N'CONTROL'))
ORDER BY Securable, Grantee, perm.permission_name;
GO

-- A8. Effective table permissions of the API login in ACQMN01_DEV
--     (the provided check, evaluated as the API login).
EXECUTE AS LOGIN = N'userAcquire';   -- << login

SELECT
    DB_NAME()   AS CurrentDatabase,
    USER_NAME() AS DatabaseUser,
    HAS_PERMS_BY_NAME(N'MyApps.CoreDescrData', N'OBJECT', N'INSERT') AS CanInsert,
    HAS_PERMS_BY_NAME(N'MyApps.CoreDescrData', N'OBJECT', N'UPDATE') AS CanUpdate,
    HAS_PERMS_BY_NAME(N'MyApps.CoreDescrData', N'OBJECT', N'SELECT') AS CanSelect,
    HAS_PERMS_BY_NAME(N'MyApps.CoreDescrData', N'OBJECT', N'DELETE') AS CanDelete;

REVERT;
GO

/*
 Reading the results
 -------------------
 - A3 shows ACQMN01_DEV (and A2's database is ACQMN01):
     CROSS-DATABASE. Ownership chains stop at the database boundary unless
     cross-db chaining is on (A6, should stay off). The INSERT is checked
     against the API login's user in ACQMN01_DEV (A7/A8 CanInsert = 0) -> 229.
     Fix: B1, or B3 (signing across databases).
 - Procedure in ACQMN01_DEV, A2 owner <> A5 owner:
     BROKEN OWNERSHIP CHAIN in one database (MyApps schema not owned by dbo).
     Fix: B2 (signing), or B1.
 - A4 UsesDynamicSql = 1:
     chaining never applies to dynamic SQL. Fix: B2/B3 (signing), or B1.
 - A7 shows DENY INSERT (or db_denydatawriter membership):
     the DENY must be removed first (B0). Neither a GRANT nor a signature
     overrides a DENY held by the caller.
 - A8 CanInsert = 1 but uploads still fail with 229:
     the API is not running as this login / against this database; recheck A1
     with the actual connection string used by the running API.
*/

-------------------------------------------------------------------------------
-- PART B — FIX OPTIONS (commented out; for a DBA to choose ONE and run)
-------------------------------------------------------------------------------
-- Never: sysadmin, db_owner, db_datawriter, schema-wide grants,
--        cross-db chaining / TRUSTWORTHY ON, or EXECUTE AS OWNER without review
--        (EXECUTE AS OWNER would also change SUSER_NAME(), i.e. the usr column
--        and the procedure's duplicate-matching key).
--
-- Grant only what the procedure's Raw core import_JSON branch actually does:
-- SELECT + INSERT + UPDATE below. Add DELETE only if its definition shows a
-- DELETE. Repeat for any other table A3 lists that it writes to.

/* ---- B0. Only if A7 shows an explicit DENY / db_denydatawriter -------------
USE [ACQMN01_DEV];
REVOKE INSERT ON OBJECT::[MyApps].[CoreDescrData] FROM [<ApiUser from A7>];   -- removes the DENY
-- or, if the membership is unintended:
-- ALTER ROLE [db_denydatawriter] DROP MEMBER [<ApiUser from A7>];
------------------------------------------------------------------------------ */

/* ---- B1. Object-level grant to the API user (simplest; recommended for DEV) --
-- The API login can then also write this ONE table directly, outside the
-- procedure. No schema- or database-wide rights.
USE [ACQMN01_DEV];
-- Only if A7 returned NULL (the login has no user in ACQMN01_DEV):
-- CREATE USER [userAcquire] FOR LOGIN [userAcquire];
GRANT SELECT, INSERT, UPDATE ON OBJECT::[MyApps].[CoreDescrData] TO [<ApiUser from A7>];
------------------------------------------------------------------------------ */

/* ---- B2. Module signing, procedure and table in the SAME database ---------
-- The API keeps EXECUTE only; the signed procedure carries the table rights.
-- Re-sign after every ALTER PROCEDURE (ALTER drops the signature).
USE [ACQMN01_DEV];
CREATE CERTIFICATE [UploadDataProcSigning]
    ENCRYPTION BY PASSWORD = N'<strong password>'
    WITH SUBJECT = N'Signs dbo.InsertUpdateCoreDescr_WellCAD (MyApps.CoreDescrData access)',
         EXPIRY_DATE = '2036-12-31';
CREATE USER [UploadDataProcSigner] FROM CERTIFICATE [UploadDataProcSigning];
GRANT SELECT, INSERT, UPDATE ON OBJECT::[MyApps].[CoreDescrData] TO [UploadDataProcSigner];
ADD SIGNATURE TO OBJECT::[dbo].[InsertUpdateCoreDescr_WellCAD]
    BY CERTIFICATE [UploadDataProcSigning] WITH PASSWORD = N'<strong password>';
-- Only if A1 showed CanExecute = 0:
-- GRANT EXECUTE ON OBJECT::[dbo].[InsertUpdateCoreDescr_WellCAD] TO [<ApiUser>];
------------------------------------------------------------------------------ */

/* ---- B3. Module signing ACROSS databases (procedure in ACQMN01) -----------
-- Same idea as B2; the certificate's public key is copied to ACQMN01_DEV.
USE [ACQMN01];
CREATE CERTIFICATE [UploadDataProcSigning]
    ENCRYPTION BY PASSWORD = N'<strong password>'
    WITH SUBJECT = N'Signs dbo.InsertUpdateCoreDescr_WellCAD (cross-db to ACQMN01_DEV)',
         EXPIRY_DATE = '2036-12-31';
ADD SIGNATURE TO OBJECT::[dbo].[InsertUpdateCoreDescr_WellCAD]
    BY CERTIFICATE [UploadDataProcSigning] WITH PASSWORD = N'<strong password>';
DECLARE @PublicKey varbinary(max) = CERTENCODED(CERT_ID(N'UploadDataProcSigning'));
DECLARE @Sql nvarchar(max) =
    N'CREATE CERTIFICATE [UploadDataProcSigning] FROM BINARY = '
    + CONVERT(nvarchar(max), @PublicKey, 1) + N';';
EXEC [ACQMN01_DEV].sys.sp_executesql @Sql;   -- public key only, no private key

USE [ACQMN01_DEV];
CREATE USER [UploadDataProcSigner] FROM CERTIFICATE [UploadDataProcSigning];
-- A cross-database signature needs AUTHENTICATE in the target database:
GRANT AUTHENTICATE TO [UploadDataProcSigner];
GRANT SELECT, INSERT, UPDATE ON OBJECT::[MyApps].[CoreDescrData] TO [UploadDataProcSigner];
-- The caller still needs CONNECT to ACQMN01_DEV (a user, as in B1, without the table grant).
------------------------------------------------------------------------------ */

-------------------------------------------------------------------------------
-- PART C — VERIFY AFTER THE FIX (read-only; run after test uploads)
-------------------------------------------------------------------------------
/*
SELECT HOLEID, PROJECTCODE, [FROM], [TO], PRIORITY, NAME, VALUE, COMMENT_VALUE, usr
FROM [ACQMN01_DEV].[MyApps].[CoreDescrData]
WHERE HOLEID = 'GTZO_0001_1'
ORDER BY [FROM], [TO], NAME;

-- Duplicate check: must return no rows after uploading the same file twice.
SELECT HOLEID, PROJECTCODE, [FROM], [TO], PRIORITY, NAME, usr, COUNT(*) AS Copies
FROM [ACQMN01_DEV].[MyApps].[CoreDescrData]
WHERE HOLEID = 'GTZO_0001_1'
GROUP BY HOLEID, PROJECTCODE, [FROM], [TO], PRIORITY, NAME, usr
HAVING COUNT(*) > 1;
*/
