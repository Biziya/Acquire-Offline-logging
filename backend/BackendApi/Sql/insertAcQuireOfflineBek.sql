/*
================================================================================
 dbo.insertAcQuireOfflineBek — Upload Data from the AcQuire Offline website
================================================================================
 Based on the 'Raw core import_JSON' branch of
 dbo.InsertUpdateCoreDescr_WellCAD, with these differences:
   - usr = @usr, the uploader the API verified with Windows authentication
     (BDOM\<user>), NOT SUSER_NAME() (= the SQL login userAcquire).
   - An upload REPLACES the same uploader's earlier rows for the drillhole
     and project (the old branch only inserted and updated, so a re-split
     interval, a deleted row or a cleared code stayed in the table).
   - Depths are decimal(9,2) instead of float; two rows with the same depths,
     From >= To, negative depths and values too long for their column are
     refused instead of stored, cut off or picked at random.
   - The file name is stored in [FileName].
   - Two uploads of the same drillhole run one after the other (sp_getapplock).

 Same parameters as the old procedure, so the API only changes the name.
 dbo.InsertUpdateCoreDescr_WellCAD is NOT changed (WellCAD keeps using it).

 omFacies and py are stored too (the old branch dropped them), as NAME
 'OMFacies' and 'PY', the same short style as 'CA', 'OM' and 'OX'. If acQuire or
 WellCAD expects other names for them, change them here, in the DELETE list
 below and in Repositories/DataViewer/DataViewerIntervals.cs.

 Permissions: the DELETE runs inside the procedure, so the website login only
 needs EXECUTE as long as dbo owns the MyApps schema (ownership chaining).
 Otherwise also: GRANT DELETE ON MyApps.CoreDescrData TO [userAcquire];

 Run once in SSMS on BMNULAADB02 (ACQMN01), then grant the website login:
   GRANT EXECUTE ON dbo.insertAcQuireOfflineBek TO <database user of userAcquire>;
 (see the GRANT at the end).
================================================================================
*/
USE [ACQMN01];
GO
SET ANSI_NULLS ON;
GO
SET QUOTED_IDENTIFIER ON;
GO

CREATE OR ALTER PROCEDURE dbo.insertAcQuireOfflineBek
    @Action   varchar(50),
    @Hole     varchar(20)   = NULL,
    @usr      varchar(50)   = NULL,
    @fileName varchar(50)   = NULL,
    @str_json nvarchar(max) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    IF @Action IS NULL OR @Action <> 'Raw core import_JSON'
        THROW 51002, 'insertAcQuireOfflineBek only supports @Action = ''Raw core import_JSON''.', 1;

    IF @str_json IS NULL OR @str_json = N''
        THROW 51003, 'No data to upload (@str_json is empty).', 1;

    IF @Hole IS NULL OR LTRIM(RTRIM(@Hole)) = ''
        THROW 51004, '@Hole is required: an upload replaces that drillhole''s rows.', 1;

    -- The uploader sent by the API (BDOM\<user>). It is never replaced by the
    -- SQL login. Only a manual call without @usr records the caller's login.
    SET @usr = COALESCE(NULLIF(LTRIM(RTRIM(@usr)), ''), SUSER_SNAME());

    /*
     * Read the file. Text is read wide (nvarchar(max)) so a value too long for
     * its column is refused below instead of being cut off silently. Depths
     * are decimal(9,2), never float, so 10.1 always equals 10.1.
     */
    SELECT t1.HOLEID, t1.PROJECTCODE,
           t2.LithoFrom, t2.LithoTo,
           t2.LithoFacies, t2.Colour, t2.RedoxFacies, t2.CA, t2.OM, t2.OMFacies, t2.PY, t2.OX,
           t2.InternalStructure, t2.Granulo, t2.Hardness, t2.LithologyComments
    INTO #hole_core_json
    FROM OPENJSON(@str_json)
         WITH (HOLEID nvarchar(max) '$.drillhole', PROJECTCODE nvarchar(max) '$.project') AS t1
    CROSS JOIN OPENJSON(@str_json, '$.rows')
         WITH (LithoFrom decimal(9,2) '$.lithoFrom', LithoTo decimal(9,2) '$.lithoTo',
               LithoFacies nvarchar(max) '$.lithoCode', Colour nvarchar(max) '$.colorCode',
               CA nvarchar(max) '$.ca', OM nvarchar(max) '$.om',
               OMFacies nvarchar(max) '$.omFacies', PY nvarchar(max) '$.py', OX nvarchar(max) '$.ox',
               InternalStructure nvarchar(max) '$.sedim', RedoxFacies nvarchar(max) '$.redoxCode',
               Granulo nvarchar(max) '$.granulo', Hardness nvarchar(max) '$.hardness',
               LithologyComments nvarchar(max) '$.lithologyComments') AS t2;

    -- One drillhole per call, the one the API names.
    IF EXISTS (SELECT 1 FROM #hole_core_json
               WHERE HOLEID IS NULL OR HOLEID <> @Hole OR PROJECTCODE IS NULL)
        THROW 51009, 'The file''s drillhole or project is missing or does not match @Hole.', 1;

    IF EXISTS (SELECT 1 FROM #hole_core_json
               WHERE LithoFrom IS NULL OR LithoTo IS NULL OR LithoFrom < 0 OR LithoFrom >= LithoTo)
        THROW 51005, 'Every row needs From and To, with 0 <= From < To.', 1;

    IF EXISTS (SELECT 1 FROM #hole_core_json
               WHERE LEN(HOLEID) > 20 OR LEN(PROJECTCODE) > 10
                  OR LEN(LithoFacies) > 20 OR LEN(Colour) > 20 OR LEN(RedoxFacies) > 20
                  OR LEN(CA) > 20 OR LEN(OM) > 20 OR LEN(OMFacies) > 20 OR LEN(PY) > 20 OR LEN(OX) > 20
                  OR LEN(InternalStructure) > 20 OR LEN(Granulo) > 20 OR LEN(Hardness) > 20
                  OR LEN(LithologyComments) > 254)
        THROW 51006, 'A value is longer than its column (codes 20, project 10, comments 254).', 1;

    -- Two rows with the same depths would make the stored value a coin toss.
    IF EXISTS (SELECT 1 FROM #hole_core_json GROUP BY LithoFrom, LithoTo HAVING COUNT(*) > 1)
        THROW 51007, 'Two rows have the same From and To.', 1;

    SELECT HOLEID, PROJECTCODE, LithoFrom, LithoTo, 1 AS PRIORITY, NAME,
           NULLIF(LTRIM(RTRIM(VALUE)), N'') AS VALUE,
           CAST(NULL AS nvarchar(254)) AS COMMENT_VALUE
    INTO #hole_core_raw
    FROM #hole_core_json
    UNPIVOT (VALUE FOR NAME IN (LithoFacies, Colour, RedoxFacies, CA, OM, OMFacies, PY, OX,
                                InternalStructure, Granulo, Hardness)) AS up
    UNION ALL
    SELECT HOLEID, PROJECTCODE, LithoFrom, LithoTo, 1, N'LithologyComments', NULL, LithologyComments
    FROM #hole_core_json
    WHERE LithologyComments IS NOT NULL AND LithologyComments <> N'';

    /*
     * The file is this uploader's whole log of the drillhole, so it REPLACES
     * what the same uploader stored before for this hole and project: a
     * re-split interval, a deleted row or a cleared code does not survive.
     * Only the NAMEs this procedure writes are touched; other people's rows,
     * and other attributes (WellCAD imports), are left alone.
     *
     * The application lock serialises two uploads of the same hole (a double
     * click, or a retry while the first is still running), so they cannot
     * both insert.
     */
    BEGIN TRANSACTION;

    DECLARE @lockResult int;
    DECLARE @lockName nvarchar(255) = N'insertAcQuireOfflineBek:' + @Hole;
    EXEC @lockResult = sp_getapplock @Resource = @lockName, @LockMode = 'Exclusive',
                                     @LockOwner = 'Transaction', @LockTimeout = 60000;
    IF @lockResult < 0
        THROW 51008, 'Another upload of this drillhole is still running. Try again shortly.', 1;

    DELETE t
    FROM MyApps.CoreDescrData AS t
    WHERE t.HOLEID = @Hole
      AND t.PROJECTCODE IN (SELECT DISTINCT PROJECTCODE FROM #hole_core_json)
      AND t.usr = @usr
      AND t.PRIORITY = 1
      AND t.NAME IN (N'LithoFacies', N'Colour', N'RedoxFacies', N'CA', N'OM',
                     N'OMFacies', N'PY', N'OX',
                     N'InternalStructure', N'Granulo', N'Hardness', N'LithologyComments');

    INSERT INTO MyApps.CoreDescrData
           (HOLEID, PROJECTCODE, [FROM], [TO], PRIORITY, NAME, VALUE, COMMENT_VALUE, usr, [FileName])
    SELECT HOLEID, PROJECTCODE, LithoFrom, LithoTo, PRIORITY, NAME, VALUE, COMMENT_VALUE, @usr, @fileName
    FROM #hole_core_raw
    WHERE VALUE IS NOT NULL OR COMMENT_VALUE IS NOT NULL;

    COMMIT TRANSACTION;

    -- What is now stored for this hole by this uploader.
    SELECT HOLEID, PROJECTCODE, [FROM], [TO], PRIORITY, NAME, VALUE, COMMENT_VALUE, usr
    FROM MyApps.CoreDescrData
    WHERE HOLEID = @Hole AND usr = @usr AND PRIORITY = 1
    ORDER BY PROJECTCODE, [FROM], [TO], NAME;
END;
GO

-- Let the website's login run it. The database user of login userAcquire is
-- usually also called userAcquire; check with:
--   SELECT dp.name FROM sys.database_principals dp
--   JOIN sys.server_principals sp ON sp.sid = dp.sid WHERE sp.name = 'userAcquire';
GRANT EXECUTE ON dbo.insertAcQuireOfflineBek TO [userAcquire];
GO

-- TEST (rolled back, runs as the website login).
-- 1st upload: 5-10 with a CA code. 2nd upload: 5-10 re-split into 5-8 and
-- 8-10, CA cleared. Expect only 5-8 and 8-10, no CA row, usr =
-- BDOM\diagnose-test and FileName = second.json.
BEGIN TRAN;
EXECUTE AS LOGIN = 'userAcquire';
EXEC dbo.insertAcQuireOfflineBek
     @Action   = 'Raw core import_JSON',
     @Hole     = 'USR_DIAG_TEST',
     @usr      = 'BDOM\diagnose-test',
     @fileName = 'first.json',
     @str_json = N'{"project":"ZOOVCH","drillhole":"USR_DIAG_TEST","rows":[{"lithoFrom":5,"lithoTo":10,"lithoCode":"0--","colorCode":"10G4/2","redoxCode":"0042_MN1","ca":"1","om":"","ox":"","sedim":"","granulo":"","hardness":"","lithologyComments":"first"}]}';
EXEC dbo.insertAcQuireOfflineBek
     @Action   = 'Raw core import_JSON',
     @Hole     = 'USR_DIAG_TEST',
     @usr      = 'BDOM\diagnose-test',
     @fileName = 'second.json',
     @str_json = N'{"project":"ZOOVCH","drillhole":"USR_DIAG_TEST","rows":[{"lithoFrom":5,"lithoTo":8,"lithoCode":"0--","colorCode":"10G4/2","redoxCode":"0042_MN1","ca":""},{"lithoFrom":8,"lithoTo":10.5,"lithoCode":"0--","colorCode":"10G4/2","redoxCode":"0042_MN1","lithologyComments":"split"}]}';
REVERT;
SELECT [FROM], [TO], NAME, VALUE, COMMENT_VALUE, usr, [FileName]
FROM MyApps.CoreDescrData WHERE HOLEID = 'USR_DIAG_TEST'
ORDER BY [FROM], NAME;
ROLLBACK;
GO
