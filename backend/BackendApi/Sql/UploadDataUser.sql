/*
================================================================================
 Upload Data — record the Windows user in usr instead of the SQL login
================================================================================

 The API now sends the verified Windows user of the frontend (Windows
 Integrated Authentication, e.g. 'BDOM\jsmith') as @usr varchar(50). The SQL
 connection still uses the login userAcquire.

 The procedure currently starts with
     SELECT @usr = SUSER_NAME();
 which replaces whatever @usr the caller sends, so usr always holds
 'userAcquire'. That one line is the only change needed; no new parameter.

 PART A is read-only. PART B is commented out; a DBA reviews and applies it.
================================================================================
*/

USE [ACQMN01];
GO

-------------------------------------------------------------------------------
-- PART A — CHECKS (read-only)
-------------------------------------------------------------------------------

-- A1. Every line of the procedure that sets or uses @usr / the login.
SELECT value AS ProcedureLine
FROM STRING_SPLIT(
        REPLACE(OBJECT_DEFINITION(OBJECT_ID(N'dbo.InsertUpdateCoreDescr_WellCAD')), CHAR(13), N''),
        CHAR(10))
WHERE value LIKE N'%@usr%'
   OR value LIKE N'%SUSER_%'
   OR value LIKE N'%SYSTEM_USER%'
   OR value LIKE N'%ORIGINAL_LOGIN%';

-- A2. usr must hold 'DOMAIN\user' (the API allows up to 50 characters).
SELECT c.name AS ColumnName, t.name AS DataType, c.max_length AS MaxBytes
FROM sys.columns AS c
JOIN sys.types AS t ON t.user_type_id = c.user_type_id
WHERE c.object_id = OBJECT_ID(N'MyApps.CoreDescrData')
  AND c.name = N'usr';

-- A3. Rows stored so far under the SQL login. usr is part of the procedure's
--     duplicate-matching key (HOLEID, PROJECTCODE, FROM, TO, PRIORITY, NAME,
--     usr): after the change, re-uploading one of these drillholes adds new
--     rows under the Windows user instead of updating these.
SELECT HOLEID, COUNT(*) AS RowsAsSqlLogin
FROM [MyApps].[CoreDescrData]
WHERE usr = N'userAcquire'
GROUP BY HOLEID
ORDER BY HOLEID;
GO

-------------------------------------------------------------------------------
-- PART B — CHANGE (commented out)
-------------------------------------------------------------------------------
/*
 B1. In dbo.InsertUpdateCoreDescr_WellCAD (script it with "Modify" in SSMS),
     replace
         SELECT @usr = SUSER_NAME();
     with
         SET @usr = COALESCE(NULLIF(LTRIM(RTRIM(@usr)), ''), SUSER_NAME());
     The caller's @usr wins; a call without one (the SSMS test in
     SQLTests/Test_UploadData_StoredProcedure.sql) still stores the login.
     Apply the same replacement to any other line A1 shows assigning @usr from
     SUSER_NAME() / SUSER_SNAME() / SYSTEM_USER / ORIGINAL_LOGIN().

 B2. If the procedure was signed (UploadDataPermissions.sql, option B1):
     ALTER PROCEDURE drops the signature. Re-sign it right after:
         ADD SIGNATURE TO OBJECT::[dbo].[InsertUpdateCoreDescr_WellCAD]
             BY CERTIFICATE [UploadDataProcSigning] WITH PASSWORD = N'<password>';

 B3. Decide what to do with the rows A3 lists (keep, or set usr to the real
     importer if known) before users re-upload those drillholes.
*/

-------------------------------------------------------------------------------
-- PART C — VERIFY (after an upload through the frontend)
-------------------------------------------------------------------------------
/*
SELECT TOP (50) HOLEID, [FROM], [TO], NAME, VALUE, usr, FileName
FROM [ACQMN01].[MyApps].[CoreDescrData]
WHERE HOLEID = '<uploaded drillhole>'
ORDER BY [FROM], [TO], NAME;
-- usr must be 'BDOM\<uploader>', not 'userAcquire' and not 'BDOM\BMNDULAAS01$'.
*/
