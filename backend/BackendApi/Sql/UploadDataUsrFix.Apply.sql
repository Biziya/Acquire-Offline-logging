/*
================================================================================
 Upload Data — APPLY the usr fix to dbo.InsertUpdateCoreDescr_WellCAD
================================================================================

 Keeps the uploader's Windows account (@usr, sent by the API as the verified
 DOMAIN\user of whoever uploads) in usr, instead of overwriting it with
 SUSER_NAME() (= the SQL login userAcquire). Background, checks and
 rollback tests: UploadDataUsrFix.sql (PART A before, PART C after).

 How to run (SSMS, on BMNULAADB02; DEVELOPMENT first):
   0. Back up the procedure: Object Explorer → ACQMN01 → Programmability →
      Stored Procedures → dbo.InsertUpdateCoreDescr_WellCAD → Script Stored
      Procedure as → CREATE To → File. To undo, run that file with CREATE
      changed to ALTER.
   1. Run with @Apply = 0 (preview, nothing changes). Check:
        CurrentLine: exactly one line such as  SELECT @usr = SUSER_NAME()
        NewLine:     SET @usr = COALESCE(NULLIF(LTRIM(RTRIM(@usr)), N''), SUSER_SNAME())
                     and ALTER PROCEDURE
   2. Set @Apply = 1 and run again. Expect "Procedure updated."

 The script stops without changing anything when:
   - not exactly one line overwrites @usr (other actions may rely on theirs:
     edit the 'Raw core import_JSON' line by hand instead);
   - the line is written in a form it does not recognise;
   - the procedure was created with ANSI_NULLS or QUOTED_IDENTIFIER OFF.

 After applying: if the procedure was signed with a certificate
 (UploadDataPermissions.sql), ALTER removed the signature — re-sign it.
================================================================================
*/

USE [ACQMN01];
GO

DECLARE @Apply bit = 0;   -- 0 = preview only, 1 = alter the procedure

DECLARE @ProcId int = OBJECT_ID(N'dbo.InsertUpdateCoreDescr_WellCAD');
DECLARE @Old nvarchar(max) = OBJECT_DEFINITION(@ProcId);
DECLARE @New nvarchar(max) = @Old;
DECLARE @Fix nvarchar(200) =
    N'SET @usr = COALESCE(NULLIF(LTRIM(RTRIM(@usr)), N''''), SUSER_SNAME())';

IF @Old IS NULL
    THROW 50000, N'Procedure not found, or you have no VIEW DEFINITION permission.', 1;

-- The ALTER runs with the session's settings; they must match the original.
IF EXISTS (SELECT 1 FROM sys.sql_modules
           WHERE object_id = @ProcId AND (uses_ansi_nulls = 0 OR uses_quoted_identifier = 0))
    THROW 50000, N'Procedure uses ANSI_NULLS/QUOTED_IDENTIFIER OFF: edit it manually in SSMS instead.', 1;

-- 1. Lines that overwrite @usr with the SQL login.
DECLARE @Matches int = (
    SELECT COUNT(*)
    FROM STRING_SPLIT(REPLACE(@Old, CHAR(13), N''), CHAR(10))
    WHERE REPLACE(value, N' ', N'') LIKE N'%@usr=SUSER[_]NAME()%'
       OR REPLACE(value, N' ', N'') LIKE N'%@usr=SUSER[_]SNAME()%');

SELECT value AS CurrentLine
FROM STRING_SPLIT(REPLACE(@Old, CHAR(13), N''), CHAR(10))
WHERE value LIKE N'%@usr%' OR value LIKE N'%SUSER[_]%';

IF @Matches <> 1
BEGIN
    SELECT @Matches AS LinesOverwritingUsr,
           N'Expected exactly 1. Nothing changed: edit the ''Raw core import_JSON'' line by hand (see CurrentLine).' AS Result;
    RETURN;
END;

-- 2. Replace that one line (usual spellings, with and without spaces).
SET @New = REPLACE(@New, N'SELECT @usr = SUSER_NAME()',  @Fix);
SET @New = REPLACE(@New, N'SELECT @usr=SUSER_NAME()',    @Fix);
SET @New = REPLACE(@New, N'SET @usr = SUSER_NAME()',     @Fix);
SET @New = REPLACE(@New, N'SET @usr=SUSER_NAME()',       @Fix);
SET @New = REPLACE(@New, N'SELECT @usr = SUSER_SNAME()', @Fix);
SET @New = REPLACE(@New, N'SELECT @usr=SUSER_SNAME()',   @Fix);
SET @New = REPLACE(@New, N'SET @usr = SUSER_SNAME()',    @Fix);
SET @New = REPLACE(@New, N'SET @usr=SUSER_SNAME()',      @Fix);

IF @New = @Old
BEGIN
    SELECT N'The line is written in a form this script does not recognise. Nothing changed: edit it by hand (see CurrentLine).' AS Result;
    RETURN;
END;

-- 3. CREATE PROCEDURE → ALTER PROCEDURE (keeps the procedure's permissions).
DECLARE @At int = PATINDEX(N'%CREATE%PROC%', @New);
IF @At = 0
    THROW 50000, N'CREATE PROCEDURE not found in the definition. Nothing changed.', 1;
SET @New = STUFF(@New, @At, LEN(N'CREATE'), N'ALTER');

-- 4. Preview of the changed lines.
SELECT value AS NewLine
FROM STRING_SPLIT(REPLACE(@New, CHAR(13), N''), CHAR(10))
WHERE value LIKE N'%@usr%' OR value LIKE N'%SUSER[_]%' OR value LIKE N'%ALTER%PROC%';

IF @Apply = 0
BEGIN
    SELECT N'Preview only. Check NewLine, then set @Apply = 1 and run again.' AS Result;
    RETURN;
END;

-- 5. Apply in a transaction: any error leaves the procedure unchanged.
BEGIN TRY
    BEGIN TRAN;
    EXEC sys.sp_executesql @New;
    COMMIT;
    SELECT N'Procedure updated. Now run PART C of UploadDataUsrFix.sql.' AS Result;
END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0 ROLLBACK;
    THROW;
END CATCH;
GO
