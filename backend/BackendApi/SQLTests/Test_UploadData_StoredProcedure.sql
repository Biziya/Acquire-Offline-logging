/*
================================================================================
 Test_UploadData_StoredProcedure.sql
 Runs the Upload Data stored procedure directly in SSMS, without the backend.

   Procedure  dbo.InsertUpdateCoreDescr_WellCAD  @Action = 'Raw core import_JSON'
   Table      MyApps.CoreDescrData

 SAFE BY DEFAULT
   - Sections A–D and G are read-only.
   - Sections E–F (the procedure call) run only when @RunProcedureTest = 1,
     inside a transaction that is ALWAYS rolled back. There is no COMMIT.
   - Nothing here grants permissions, alters objects, or writes outside the
     procedure.

 HOW TO RUN (see README.md in this folder)
   1. Connect with the SAME login as the backend (SQL Server Authentication,
      userAcquire) — or, as a DBA, uncomment EXECUTE AS LOGIN in Section A.
   2. Check the USE line below. The upload API writes to ACQMN01_DEV
      (CoreDescrData:Database); the other APIs use ACQMN01.
      Every query in this script uses the database selected here.
   3. Execute the whole script (F5). Read each result grid top to bottom.
================================================================================
*/

USE [ACQMN01_DEV];   -- << the upload API's database (CoreDescrData:Database)
GO

-- Optional (DBA only): test as the backend's login without knowing its password.
-- Needs IMPERSONATE on the login. Remember the REVERT at the very end.
-- EXECUTE AS LOGIN = N'userAcquire';
-- GO

/*------------------------------------------------------------------------------
 SECTION A — Connection verification (read-only)
 Compare SqlLogin with the backend's login (userAcquire). If they differ, the
 permission results below do NOT describe the backend.
------------------------------------------------------------------------------*/
SELECT
    @@SERVERNAME      AS ServerName,      -- backend: BMNULAADB02
    DB_NAME()         AS DatabaseName,
    ORIGINAL_LOGIN()  AS OriginalLogin,   -- who opened this SSMS session
    SUSER_SNAME()     AS SqlLogin,        -- the identity permissions are checked for
    USER_NAME()       AS DatabaseUser;

-- Where do the procedure and table exist? (NULL = missing or not visible)
SELECT
    db.name                                                                 AS DatabaseName,
    OBJECT_ID(QUOTENAME(db.name) + N'.dbo.InsertUpdateCoreDescr_WellCAD')   AS ProcedureObjectId,
    OBJECT_ID(QUOTENAME(db.name) + N'.MyApps.CoreDescrData')                AS TableObjectId
FROM sys.databases AS db
WHERE db.name IN (N'ACQMN01', N'ACQMN01_DEV');
GO

/*------------------------------------------------------------------------------
 SECTION B — Permission verification (read-only)

 Under the approved security model the login needs only EXECUTE on the
 procedure. CanInsert / CanUpdate / CanSelect = 0 is NORMAL and fine, as long
 as the procedure reaches the table through an intact ownership chain (same
 owner for the procedure and the table, no dynamic SQL) or through a
 certificate signature. If neither is in place, the procedure's own INSERT is
 checked against this login and fails with error 229.
------------------------------------------------------------------------------*/
SELECT
    HAS_PERMS_BY_NAME(N'dbo.InsertUpdateCoreDescr_WellCAD', N'OBJECT', N'EXECUTE') AS CanExecuteProcedure,
    HAS_PERMS_BY_NAME(N'MyApps.CoreDescrData', N'OBJECT', N'INSERT')               AS CanInsert,
    HAS_PERMS_BY_NAME(N'MyApps.CoreDescrData', N'OBJECT', N'UPDATE')               AS CanUpdate,
    HAS_PERMS_BY_NAME(N'MyApps.CoreDescrData', N'OBJECT', N'SELECT')               AS CanSelect;

-- Ownership chain: the chain is intact only if both rows show the same OwnerUser.
-- No rows / NULLs = this login cannot see the metadata; ask the DBA to run it.
SELECT
    CASE o.type WHEN 'P' THEN N'procedure' ELSE N'table' END AS ObjectType,
    s.name + N'.' + o.name                                    AS ObjectName,
    owner_user.name                                           AS OwnerUser,
    CASE
        WHEN o.type <> 'P'                     THEN NULL
        WHEN m.execute_as_principal_id IS NULL THEN N'CALLER'
        WHEN m.execute_as_principal_id = -2    THEN N'OWNER'
        ELSE USER_NAME(m.execute_as_principal_id)
    END                                                       AS ExecuteAs,
    (SELECT COUNT(*) FROM sys.crypt_properties AS cp
      WHERE cp.major_id = o.object_id)                        AS Signatures
FROM sys.objects AS o
JOIN sys.schemas AS s ON s.schema_id = o.schema_id
JOIN sys.database_principals AS owner_user
  ON owner_user.principal_id = COALESCE(o.principal_id, s.principal_id)
LEFT JOIN sys.sql_modules AS m ON m.object_id = o.object_id
WHERE o.object_id IN (OBJECT_ID(N'dbo.InsertUpdateCoreDescr_WellCAD'),
                      OBJECT_ID(N'MyApps.CoreDescrData'));
GO

/*------------------------------------------------------------------------------
 SECTIONS C–F run as ONE batch (they share variables). Do not put GO inside.
------------------------------------------------------------------------------*/
SET NOCOUNT ON;
SET XACT_ABORT ON;   -- any error dooms the test transaction; CATCH rolls it back

/*------------------------------------------------------------------------------
 SECTION C — JSON preparation

 The same shape the backend sends as @str_json: project, drillhole, rows, and
 per row only the fields the procedure stores. Names are the JSON names the
 procedure's OPENJSON reads — never the SQL column names.

 Default: one real row from yashgaa.json. Add rows as needed.

 FULL-FILE TEST (optional) — replace the literal below with the whole file:
   - Open yashgaa.json in an editor, copy everything, paste it between N' and '.
   - Double every single quote inside it ( ' -> '' ), e.g. in comments.
   - The original file (with extra fields such as id, py, omFacies) is fine:
     the procedure reads only the fields it knows. That also tests whether the
     backend's filtering matters.
   - Reading the file from disk (OPENROWSET(BULK ...)) only works for a path on
     the SQL Server machine or a share its service account can read, and needs
     ADMINISTER BULK OPERATIONS — normally not available. Paste instead.
------------------------------------------------------------------------------*/
DECLARE @str_json nvarchar(max) = N'
{
  "project": "ZOOVCH",
  "drillhole": "GTZO_0001_1",
  "rows": [
    {
      "lithoFrom": 5,
      "lithoTo": 10,
      "lithoCode": "0--",
      "colorCode": "10G4/2",
      "redoxCode": "0042_MN1",
      "ca": "",
      "om": "",
      "ox": "",
      "sedim": "",
      "granulo": "",
      "hardness": "",
      "lithologyComments": ""
    }
  ]
}';

DECLARE @FileName varchar(50) = 'yashgaa.json';   -- @fileName varchar(50)
DECLARE @User     varchar(50) = NULL;             -- @usr: the procedure replaces it with SUSER_NAME()

-- Switches. Leave at 0 for a read-only run.
DECLARE @RunProcedureTest   bit = 0;   -- 1 = run Sections E–F (always rolled back)
DECLARE @CheckRepeatUpload  bit = 1;   -- with the test: run the procedure twice, compare row counts

/*------------------------------------------------------------------------------
 SECTION D — Validate JSON parsing (read-only)
------------------------------------------------------------------------------*/
IF ISJSON(@str_json) <> 1
BEGIN
    SELECT N'STOP: @str_json is not valid JSON. Nothing was executed.' AS Result;
    RETURN;
END;

DECLARE @JsonDrillhole nvarchar(4000) = JSON_VALUE(@str_json, N'$.drillhole');
DECLARE @JsonProject   nvarchar(4000) = JSON_VALUE(@str_json, N'$.project');

-- Document-level checks, mirroring the backend's validation.
SELECT
    ISJSON(@str_json)                                         AS IsJson,
    @JsonDrillhole                                            AS Drillhole,
    LEN(@JsonDrillhole)                                       AS DrillholeLength,   -- must be 1..20 (@Hole varchar(20))
    @JsonProject                                              AS Project,
    (SELECT COUNT(*) FROM OPENJSON(@str_json, N'$.rows'))     AS RowsInJson,        -- must be > 0
    (SELECT COUNT(*)
       FROM OPENJSON(@str_json, N'$.rows') AS r
      WHERE TRY_CAST(JSON_VALUE(r.value, N'$.lithoFrom') AS decimal(18, 4)) IS NULL
         OR TRY_CAST(JSON_VALUE(r.value, N'$.lithoTo')   AS decimal(18, 4)) IS NULL
         OR TRY_CAST(JSON_VALUE(r.value, N'$.lithoFrom') AS decimal(18, 4))
         >= TRY_CAST(JSON_VALUE(r.value, N'$.lithoTo')   AS decimal(18, 4)))
                                                              AS InvalidIntervals,  -- must be 0
    LEN(@FileName)                                            AS FileNameLength;    -- must be <= 50

-- Each row as SQL Server reads it. A NULL in a *Numeric column means SQL
-- Server cannot read that depth as a number.
SELECT
    CAST(r.[key] AS int) + 1                                          AS RowNumber,
    @JsonDrillhole                                                    AS Drillhole,
    @JsonProject                                                      AS Project,
    JSON_VALUE(r.value, N'$.lithoFrom')                               AS LithoFrom,
    JSON_VALUE(r.value, N'$.lithoTo')                                 AS LithoTo,
    TRY_CAST(JSON_VALUE(r.value, N'$.lithoFrom') AS decimal(18, 4))   AS LithoFromNumeric,
    TRY_CAST(JSON_VALUE(r.value, N'$.lithoTo')   AS decimal(18, 4))   AS LithoToNumeric,
    JSON_VALUE(r.value, N'$.lithoCode')                               AS LithoCode,
    JSON_VALUE(r.value, N'$.colorCode')                               AS ColourCode,
    JSON_VALUE(r.value, N'$.redoxCode')                               AS RedoxCode
FROM OPENJSON(@str_json, N'$.rows') AS r
ORDER BY RowNumber;

IF @JsonDrillhole IS NULL OR LEN(@JsonDrillhole) NOT BETWEEN 1 AND 20
   OR @JsonProject IS NULL OR LEN(@FileName) > 50
BEGIN
    SELECT N'STOP: drillhole, project or file name does not fit the procedure parameters.' AS Result;
    RETURN;
END;

DECLARE @Hole varchar(20) = @JsonDrillhole;   -- safe: length checked above

IF @RunProcedureTest = 0
BEGIN
    SELECT N'Read-only run finished. To call the procedure, set @RunProcedureTest = 1 (Section C) and run again.' AS Result;
    RETURN;
END;

/*------------------------------------------------------------------------------
 SECTIONS E + F — Execute the procedure inside a rollback-only transaction

 - Rollback undoes the table changes made in this transaction. It does not
   undo side effects outside it (identity/sequence values consumed, anything
   the procedure sends to another server or file).
 - If the procedure COMMITs or ROLLBACKs on its own, the test transaction can
   end early; the script detects this and warns (see OpenTransactions).
------------------------------------------------------------------------------*/

-- State before the test (needs SELECT on the table; skipped if not allowed).
DECLARE @CanReadTable bit = 1,
        @RowsBefore int, @ChecksumBefore int,
        @RowsAfterFirstRun int, @RowsAfterSecondRun int;

BEGIN TRY
    SELECT @RowsBefore = COUNT(*), @ChecksumBefore = CHECKSUM_AGG(BINARY_CHECKSUM(*))
    FROM [MyApps].[CoreDescrData]
    WHERE HOLEID = @Hole;
END TRY
BEGIN CATCH
    SET @CanReadTable = 0;
    SELECT N'Note: this login cannot read MyApps.CoreDescrData (error '
           + CAST(ERROR_NUMBER() AS nvarchar(10)) + N'). Before/after row checks are skipped; '
           + N'the procedure test still runs.' AS Info;
END CATCH;

DECLARE @Step nvarchar(200) = N'start';

BEGIN TRY
    SET @Step = N'BEGIN TRANSACTION';
    BEGIN TRANSACTION;

    SET @Step = N'EXEC dbo.InsertUpdateCoreDescr_WellCAD (first run)';
    EXEC dbo.InsertUpdateCoreDescr_WellCAD
        @Action   = 'Raw core import_JSON',
        @Hole     = @Hole,
        @usr      = @User,
        @fileName = @FileName,
        @str_json = @str_json;

    SELECT N'Procedure completed without error. Changes are NOT committed.' AS Result,
           @@TRANCOUNT AS OpenTransactions;   -- 1 expected

    IF @@TRANCOUNT = 0
        SELECT N'WARNING: the procedure ended the test transaction itself. Its changes may '
             + N'already be permanent — check Section G and tell the DBA.' AS Warning;

    IF @CanReadTable = 1 AND @@TRANCOUNT > 0
    BEGIN
        SET @Step = N'read rows inside the transaction';
        SELECT @RowsAfterFirstRun = COUNT(*) FROM [MyApps].[CoreDescrData] WHERE HOLEID = @Hole;

        -- What the procedure wrote, as it would look if committed.
        -- A success may have UPDATED existing rows rather than inserted new ones.
        SELECT N'inside test transaction' AS [State],
               HOLEID, PROJECTCODE, [FROM], [TO], PRIORITY, NAME, VALUE, COMMENT_VALUE, usr
        FROM [MyApps].[CoreDescrData]
        WHERE HOLEID = @Hole
        ORDER BY [FROM], [TO], NAME;
    END;

    IF @CheckRepeatUpload = 1 AND @@TRANCOUNT > 0
    BEGIN
        -- Same JSON again: the procedure should update, not duplicate.
        SET @Step = N'EXEC dbo.InsertUpdateCoreDescr_WellCAD (repeat run)';
        EXEC dbo.InsertUpdateCoreDescr_WellCAD
            @Action   = 'Raw core import_JSON',
            @Hole     = @Hole,
            @usr      = @User,
            @fileName = @FileName,
            @str_json = @str_json;

        IF @CanReadTable = 1 AND @@TRANCOUNT > 0
            SELECT @RowsAfterSecondRun = COUNT(*) FROM [MyApps].[CoreDescrData] WHERE HOLEID = @Hole;
    END;

    IF @CanReadTable = 1
        SELECT @RowsBefore         AS RowsBefore,
               @RowsAfterFirstRun  AS RowsAfterFirstRun,    -- > RowsBefore: rows inserted; = : rows updated
               @RowsAfterSecondRun AS RowsAfterRepeatRun,   -- should equal RowsAfterFirstRun (no duplicates)
               CASE WHEN @RowsAfterSecondRun > @RowsAfterFirstRun
                    THEN N'Repeat upload ADDED rows: duplicates under the same login'
                    WHEN @RowsAfterSecondRun = @RowsAfterFirstRun
                    THEN N'Repeat upload added no rows'
               END                 AS RepeatUploadCheck;

    SET @Step = N'ROLLBACK (test mode)';
    IF @@TRANCOUNT > 0
        ROLLBACK TRANSACTION;
END TRY
BEGIN CATCH
    DECLARE @ErrorNumber int = ERROR_NUMBER();

    IF XACT_STATE() <> 0
        ROLLBACK TRANSACTION;   -- also covers a doomed (uncommittable) transaction

    -- The actual SQL Server error, unaltered, plus what it usually means here.
    SELECT
        @Step               AS FailedStep,
        @ErrorNumber        AS ErrorNumber,
        ERROR_SEVERITY()    AS ErrorSeverity,
        ERROR_STATE()       AS ErrorState,
        ERROR_PROCEDURE()   AS ErrorProcedure,
        ERROR_LINE()        AS ErrorLine,
        ERROR_MESSAGE()     AS ErrorMessage,
        SUSER_SNAME()       AS SqlLogin,
        USER_NAME()         AS DatabaseUser,
        DB_NAME()           AS DatabaseName,
        CASE
            WHEN @ErrorNumber IN (229, 230) THEN
                N'Permission denied. SQL Server refused an operation for this login. If the message '
              + N'names the table, EXECUTE on the procedure was allowed but its INSERT/UPDATE was '
              + N'checked against this login (broken ownership chain, dynamic SQL, or a DENY). '
              + N'JSON filtering or backend changes cannot fix this: send this row and Section B '
              + N'to the DBA.'
            WHEN @ErrorNumber = 2812 THEN
                N'Stored procedure not found in this database: check the USE line and Section A.'
            WHEN @ErrorNumber IN (2627, 2601) THEN
                N'Duplicate key: a row with the same key already exists. Review the procedure''s '
              + N'matching logic with the DBA; do not change the data.'
            WHEN @ErrorNumber = 515 THEN
                N'NULL not allowed in a column: a field the procedure needs is missing or empty in the JSON.'
            WHEN @ErrorNumber IN (8152, 2628) THEN
                N'String or binary data would be truncated: a JSON value is longer than its column.'
            WHEN @ErrorNumber = 1205 THEN
                N'Deadlock: another session used the same rows. Run the test again.'
            WHEN @ErrorNumber = 266 THEN
                N'Transaction count mismatch: the procedure commits or rolls back by itself. '
              + N'Its changes may be permanent — check Section G and tell the DBA.'
            ELSE
                N'See ErrorMessage.'
        END                 AS Diagnosis;
END CATCH;

-- Safety net: never leave this session with an open transaction.
IF @@TRANCOUNT > 0
    ROLLBACK TRANSACTION;

-- After rollback the table must be exactly as before the test.
IF @CanReadTable = 1
    SELECT @RowsBefore                                       AS RowsBefore,
           COUNT(*)                                          AS RowsAfterRollback,
           CASE WHEN COUNT(*) = @RowsBefore
                     AND ISNULL(CHECKSUM_AGG(BINARY_CHECKSUM(*)), 0) = ISNULL(@ChecksumBefore, 0)
                THEN N'Unchanged after rollback'
                ELSE N'CHANGED after rollback — tell the DBA'
           END                                               AS RollbackCheck
    FROM [MyApps].[CoreDescrData]
    WHERE HOLEID = @Hole;
GO

/*------------------------------------------------------------------------------
 SECTION G — Verify records (read-only)
 Shows what is stored now (committed data only). After a rollback-only test
 this is unchanged; after a real upload through the API it shows the result.
------------------------------------------------------------------------------*/
DECLARE @Hole varchar(20) = 'GTZO_0001_1';   -- << same drillhole as Section C

SELECT HOLEID, PROJECTCODE, [FROM], [TO], PRIORITY, NAME, VALUE, COMMENT_VALUE, usr
FROM [MyApps].[CoreDescrData]
WHERE HOLEID = @Hole
ORDER BY [FROM], [TO], NAME;

-- Duplicates under the procedure's matching key: must return no rows.
SELECT HOLEID, PROJECTCODE, [FROM], [TO], PRIORITY, NAME, usr, COUNT(*) AS Copies
FROM [MyApps].[CoreDescrData]
WHERE HOLEID = @Hole
GROUP BY HOLEID, PROJECTCODE, [FROM], [TO], PRIORITY, NAME, usr
HAVING COUNT(*) > 1;
GO

-- If EXECUTE AS LOGIN was used in Section A:
-- REVERT;
-- GO
