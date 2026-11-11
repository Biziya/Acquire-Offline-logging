/*
================================================================================
 dbo.insertAcQuireOfflineBek — Upload Data from the AcQuire Offline website
================================================================================
 Same logic as the 'Raw core import_JSON' branch of
 dbo.InsertUpdateCoreDescr_WellCAD, with ONE difference:
   usr = @usr, the uploader the API verified with Windows authentication
   (BDOM\<user>), NOT SUSER_NAME() (= the SQL login userAcquire).

 Same parameters as the old procedure, so the API only changes the name.
 dbo.InsertUpdateCoreDescr_WellCAD is NOT changed (WellCAD keeps using it).

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

    -- The uploader sent by the API (BDOM\<user>). It is never replaced by the
    -- SQL login. Only a manual call without @usr records the caller's login.
    SET @usr = COALESCE(NULLIF(LTRIM(RTRIM(@usr)), ''), SUSER_SNAME());

    WITH Hole_Core_JSON AS
    (
        SELECT t1.HOLEID, t1.PROJECTCODE,
               ROUND(t2.LithoFrom, 2) AS LithoFrom, ROUND(t2.LithoTo, 2) AS LithoTo,
               t2.LithoFacies, t2.Colour, t2.RedoxFacies, t2.CA, t2.OM, t2.OX,
               t2.InternalStructure, t2.Granulo, t2.Hardness, t2.LithologyComments
        FROM OPENJSON(@str_json)
             WITH (HOLEID varchar(20) '$.drillhole', PROJECTCODE varchar(10) '$.project') AS t1
        CROSS JOIN OPENJSON(@str_json, '$.rows')
             WITH (LithoFrom float '$.lithoFrom', LithoTo float '$.lithoTo',
                   LithoFacies varchar(20) '$.lithoCode', Colour varchar(20) '$.colorCode',
                   CA varchar(20) '$.ca', OM varchar(20) '$.om',
                   OMFacies varchar(20) '$.omFacies', PY varchar(20) '$.py', OX varchar(20) '$.ox',
                   InternalStructure varchar(20) '$.sedim', RedoxFacies varchar(20) '$.redoxCode',
                   Granulo varchar(20) '$.granulo', Hardness varchar(20) '$.hardness',
                   LithologyComments varchar(254) '$.lithologyComments') AS t2
    )
    SELECT HOLEID, PROJECTCODE, LithoFrom, LithoTo, 1 AS PRIORITY, NAME, VALUE,
           CAST(NULL AS varchar(254)) AS COMMENT_VALUE, @usr AS usr
    INTO #hole_core_raw
    FROM Hole_Core_JSON
    UNPIVOT (VALUE FOR NAME IN (LithoFacies, Colour, RedoxFacies, CA, OM, OX,
                                InternalStructure, Granulo, Hardness)) AS up
    UNION
    SELECT HOLEID, PROJECTCODE, LithoFrom, LithoTo, 1, 'LithologyComments', NULL, LithologyComments, @usr
    FROM Hole_Core_JSON
    WHERE LithologyComments IS NOT NULL AND LithologyComments <> '';

    -- New rows for this uploader.
    INSERT INTO MyApps.CoreDescrData (HOLEID, PROJECTCODE, [FROM], [TO], PRIORITY, NAME, VALUE, COMMENT_VALUE, usr)
    SELECT t1.HOLEID, t1.PROJECTCODE, t1.LithoFrom, t1.LithoTo, t1.PRIORITY, t1.NAME, t1.VALUE, t1.COMMENT_VALUE, t1.usr
    FROM #hole_core_raw AS t1
    LEFT JOIN MyApps.CoreDescrData AS t2
           ON t1.PROJECTCODE = t2.PROJECTCODE AND t1.HOLEID = t2.HOLEID
          AND t1.LithoFrom = t2.[FROM] AND t1.LithoTo = t2.[TO]
          AND t1.PRIORITY = t2.PRIORITY AND t1.NAME = t2.NAME AND t1.usr = t2.usr
    WHERE t2.HOLEID IS NULL
      AND t1.NAME IS NOT NULL
      AND (t1.VALUE IS NOT NULL OR t1.COMMENT_VALUE IS NOT NULL);

    -- Changed values in this uploader's existing rows.
    UPDATE t2
    SET t2.VALUE = t1.VALUE, t2.COMMENT_VALUE = t1.COMMENT_VALUE
    FROM #hole_core_raw AS t1
    JOIN MyApps.CoreDescrData AS t2
      ON t1.PROJECTCODE = t2.PROJECTCODE AND t1.HOLEID = t2.HOLEID
     AND t1.LithoFrom = t2.[FROM] AND t1.LithoTo = t2.[TO]
     AND t1.PRIORITY = t2.PRIORITY AND t1.NAME = t2.NAME AND t1.usr = t2.usr
    WHERE (t1.VALUE <> t2.VALUE
           OR (t1.VALUE IS NULL AND t2.VALUE IS NOT NULL)
           OR (t1.VALUE IS NOT NULL AND t2.VALUE IS NULL))
       OR (t1.COMMENT_VALUE <> t2.COMMENT_VALUE
           OR (t1.COMMENT_VALUE IS NULL AND t2.COMMENT_VALUE IS NOT NULL)
           OR (t1.COMMENT_VALUE IS NOT NULL AND t2.COMMENT_VALUE IS NULL));

    -- Same result set as the old procedure: this uploader's raw rows.
    SELECT HOLEID, PROJECTCODE, [FROM], [TO], PRIORITY, NAME, VALUE, COMMENT_VALUE, usr
    FROM MyApps.CoreDescrData
    WHERE usr = @usr AND PRIORITY = 1
    ORDER BY HOLEID, PROJECTCODE, [FROM], [TO];
END;
GO

-- Let the website's login run it. The database user of login userAcquire is
-- usually also called userAcquire; check with:
--   SELECT dp.name FROM sys.database_principals dp
--   JOIN sys.server_principals sp ON sp.sid = dp.sid WHERE sp.name = 'userAcquire';
GRANT EXECUTE ON dbo.insertAcQuireOfflineBek TO [userAcquire];
GO

-- TEST (rolled back, runs as the website login). Expect StoredUsr = BDOM\diagnose-test.
BEGIN TRAN;
EXECUTE AS LOGIN = 'userAcquire';
EXEC dbo.insertAcQuireOfflineBek
     @Action   = 'Raw core import_JSON',
     @Hole     = 'USR_DIAG_TEST',
     @usr      = 'BDOM\diagnose-test',
     @fileName = 'usr-diagnose.json',
     @str_json = N'{"project":"ZOOVCH","drillhole":"USR_DIAG_TEST","rows":[{"lithoFrom":5,"lithoTo":10,"lithoCode":"0--","colorCode":"10G4/2","redoxCode":"0042_MN1","ca":"","om":"","ox":"","sedim":"","granulo":"","hardness":"","lithologyComments":"usr diagnose"}]}';
REVERT;
SELECT DISTINCT usr AS StoredUsr FROM MyApps.CoreDescrData WHERE HOLEID = 'USR_DIAG_TEST';
ROLLBACK;
GO
