/*
================================================================================
 Upload Data — APPLY the usr fix to dbo.InsertUpdateCoreDescr_WellCAD
================================================================================

 Problem: in the 'Raw core import_JSON' branch the procedure runs
     select @usr=suser_name()
 which replaces the uploader the API sends (BDOM\<user>, verified by Windows
 authentication) with the SQL login the website connects as: userAcquire.

 Change (one line, nothing else in the procedure changes):
     IF SUSER_SNAME() COLLATE Latin1_General_CI_AS <> N'userAcquire'
        OR NULLIF(LTRIM(RTRIM(@usr)), '') IS NULL
         SET @usr = SUSER_NAME();
   - Website (login userAcquire) sending @usr → usr = BDOM\<uploader>.
   - Any other caller (SSMS, other tools) → usr = their own login, as today.
   - 'Import WellCAD' and 'Raw->Adjusted Litho' are not touched (they never
     overwrite @usr).

 How to run (SSMS on BMNULAADB02, as a login allowed to ALTER the procedure):
   0. Backup: Script Stored Procedure as → CREATE To → File.
   1. Run with @Apply = 0: shows OldLine / NewLine, changes nothing.
   2. Set @Apply = 1 and run again. Expect FixApplied = 1.
   Undo: run the backup file with CREATE changed to ALTER.

 Alternative by hand: right-click the procedure → Modify, replace line
     select @usr=suser_name()
 with the three lines above, press Execute.
================================================================================
*/

USE [ACQMN01];
GO

DECLARE @Apply bit = 0;   -- 0 = preview only, 1 = alter the procedure

DECLARE @ProcId int = OBJECT_ID(N'dbo.InsertUpdateCoreDescr_WellCAD');
DECLARE @Old  nvarchar(max) = OBJECT_DEFINITION(@ProcId);
-- Exact text of the line in ACQMN01 (the database is case-sensitive).
DECLARE @Line nvarchar(100) = N'select @usr=suser_name()';
DECLARE @Fix  nvarchar(400) =
      N'IF SUSER_SNAME() COLLATE Latin1_General_CI_AS <> N''userAcquire'' OR NULLIF(LTRIM(RTRIM(@usr)), '''') IS NULL'
    + NCHAR(13) + NCHAR(10) + N'			SET @usr = SUSER_NAME();  -- website (userAcquire) keeps the verified uploader';

IF @Old IS NULL
    THROW 50000, N'Procedure not found, or you have no VIEW DEFINITION permission.', 1;

IF @Old LIKE N'%NULLIF(LTRIM(RTRIM(@usr))%'
BEGIN
    SELECT N'Fix is already applied. Nothing changed.' AS Result;
    RETURN;
END;

IF (LEN(@Old) - LEN(REPLACE(@Old, @Line, N''))) / LEN(@Line) <> 1
    THROW 50000, N'"select @usr=suser_name()" not found exactly once. Nothing changed: use Modify in SSMS instead.', 1;

DECLARE @New nvarchar(max) = REPLACE(@Old, @Line, @Fix);

-- The stored definition starts with CREATE; turn it into ALTER (keeps permissions).
DECLARE @At int = CHARINDEX(N'CREATE PROCEDURE', @New COLLATE Latin1_General_CI_AS);
IF @At = 0 SET @At = CHARINDEX(N'CREATE PROC ', @New COLLATE Latin1_General_CI_AS);
IF @At > 0
    SET @New = STUFF(@New, @At, LEN(N'CREATE'), N'ALTER');
ELSE IF CHARINDEX(N'ALTER PROC', @New COLLATE Latin1_General_CI_AS) = 0
    THROW 50000, N'Neither CREATE nor ALTER PROCEDURE found. Nothing changed.', 1;

SELECT @Line AS OldLine, @Fix AS NewLine;

IF @Apply = 0
BEGIN
    SELECT N'Preview only. Set @Apply = 1 and run again.' AS Result;
    RETURN;
END;

BEGIN TRY
    BEGIN TRAN;
    EXEC sys.sp_executesql @New;
    COMMIT;
END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0 ROLLBACK;
    THROW;
END CATCH;

SELECT o.modify_date,
       CASE WHEN OBJECT_DEFINITION(o.object_id) LIKE N'%NULLIF(LTRIM(RTRIM(@usr))%'
            THEN 1 ELSE 0 END AS FixApplied     -- expect 1
FROM sys.objects AS o
WHERE o.object_id = @ProcId;
GO
