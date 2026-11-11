/*
================================================================================
 Upload Data — WHY is usr still 'userAcquire'?  (changes nothing: D0–D5 only
 read; D6 calls the procedure inside a transaction and ROLLS it back)
================================================================================

 The API sends the uploader's Windows account (BDOM\<user>) as @usr to
 dbo.InsertUpdateCoreDescr_WellCAD. If usr is still 'userAcquire', SQL
 Server replaces or ignores @usr somewhere. This script finds where:

   D0  database / compatibility level / who you are
   D1  is dbo.InsertUpdateCoreDescr_WellCAD a real procedure or a synonym?
   D2  was UploadDataUsrFix.Apply.sql applied?
   D3  every procedure line that touches usr or a login function
   D4  a DEFAULT constraint on CoreDescrData.usr
   D5  triggers on CoreDescrData that may overwrite usr
   D6  does the procedure keep @usr?  (test call, ROLLED BACK — fill in first)
   D7  what the last uploads stored

 Run it in SSMS on BMNULAADB02 and send back the result grids of D3 and D6
 (D7 if you fill it in). Nothing is kept by this script.
 It does not use STRING_SPLIT, so it works on any compatibility level.
================================================================================
*/

USE [ACQMN01];
GO

-- D0. Where am I?
SELECT DB_NAME()             AS DatabaseName,
       d.compatibility_level AS CompatibilityLevel,   -- < 130: STRING_SPLIT unavailable
       SUSER_SNAME()         AS YouAre,
       @@VERSION             AS SqlServerVersion
FROM sys.databases AS d
WHERE d.name = DB_NAME();

-- D1. What the API calls. type_desc must be SQL_STORED_PROCEDURE.
--     SYNONYM means the real procedure lives elsewhere (see base_object_name).
SELECT o.name, SCHEMA_NAME(o.schema_id) AS SchemaName, o.type_desc,
       o.create_date, o.modify_date, s.base_object_name
FROM sys.objects AS o
LEFT JOIN sys.synonyms AS s ON s.object_id = o.object_id
WHERE o.name = N'InsertUpdateCoreDescr_WellCAD';

-- D2. Fix applied?  FixApplied = 1 and a recent modify_date (D1) expected.
SELECT CASE WHEN OBJECT_DEFINITION(OBJECT_ID(N'dbo.InsertUpdateCoreDescr_WellCAD'))
                 LIKE N'%COALESCE(NULLIF(LTRIM(RTRIM(@usr))%'
            THEN 1 ELSE 0 END AS FixApplied,
       CASE WHEN OBJECT_DEFINITION(OBJECT_ID(N'dbo.InsertUpdateCoreDescr_WellCAD')) IS NULL
            THEN N'Definition not visible: not a procedure here, or no VIEW DEFINITION permission'
            ELSE N'Definition visible' END AS Visibility;

-- D3. Every line of the procedure that touches usr or a login function,
--     with its line number. Send this grid back: it shows where 'userAcquire'
--     comes from (e.g. SUSER_NAME() written straight into the INSERT/UPDATE,
--     SYSTEM_USER, ORIGINAL_LOGIN(), a literal 'userAcquire', or another
--     procedure called with EXEC).
WITH Src AS (
    SELECT REPLACE(OBJECT_DEFINITION(OBJECT_ID(N'dbo.InsertUpdateCoreDescr_WellCAD')), CHAR(13), N'')
           + CHAR(10) AS Body
),
Lines AS (
    SELECT 1 AS LineNum,
           LEFT(Body, CHARINDEX(CHAR(10), Body) - 1) AS Line,
           STUFF(Body, 1, CHARINDEX(CHAR(10), Body), N'') AS Rest
    FROM Src
    WHERE Body IS NOT NULL
    UNION ALL
    SELECT LineNum + 1,
           LEFT(Rest, CHARINDEX(CHAR(10), Rest) - 1),
           STUFF(Rest, 1, CHARINDEX(CHAR(10), Rest), N'')
    FROM Lines
    WHERE Rest <> N''
)
SELECT LineNum, Line
FROM Lines
WHERE Line LIKE N'%usr%'
   OR Line LIKE N'%SUSER[_]%'
   OR Line LIKE N'%SYSTEM[_]USER%'
   OR Line LIKE N'%ORIGINAL[_]LOGIN%'
   OR Line LIKE N'%CURRENT[_]USER%'
   OR Line LIKE N'%USER[_]NAME%'
   OR Line LIKE N'%userAcquire%'
   OR Line LIKE N'%Raw core import[_]JSON%'
   OR Line LIKE N'%EXEC%'
   OR Line LIKE N'%INSERT%'
   OR Line LIKE N'%UPDATE%'
   OR Line LIKE N'%MERGE%'
ORDER BY LineNum
OPTION (MAXRECURSION 0);

-- D4. A default on usr is used when an INSERT leaves usr out.
SELECT dc.name AS DefaultName, dc.definition
FROM sys.default_constraints AS dc
JOIN sys.columns AS c
  ON c.object_id = dc.parent_object_id AND c.column_id = dc.parent_column_id
WHERE dc.parent_object_id = OBJECT_ID(N'MyApps.CoreDescrData')
  AND c.name = N'usr';

-- D5. Triggers on the table (a trigger can overwrite usr after the insert).
SELECT t.name AS TriggerName, t.is_disabled,
       CASE WHEN OBJECT_DEFINITION(t.object_id) LIKE N'%usr%' THEN 1 ELSE 0 END AS TouchesUsr,
       OBJECT_DEFINITION(t.object_id) AS Definition
FROM sys.triggers AS t
WHERE t.parent_id = OBJECT_ID(N'MyApps.CoreDescrData');
GO

-- D6. Does the procedure keep @usr and @fileName?  Ready to run: it uses a
--     made-up drillhole (USR_DIAG_TEST) and a one-row JSON in the exact shape
--     the API sends. Everything is ROLLED BACK: nothing is kept.
--     StoredUsr 'BDOM\diagnose-test' → the procedure keeps @usr.
--     StoredUsr 'userAcquire' (or your own login) → it ignores @usr.
--     StoredFileName NULL → it ignores @fileName too.
BEGIN TRAN;
EXEC dbo.InsertUpdateCoreDescr_WellCAD
     @Action   = 'Raw core import_JSON',
     @Hole     = 'USR_DIAG_TEST',
     @usr      = 'BDOM\diagnose-test',
     @fileName = 'usr-diagnose.json',
     @str_json = N'{"project":"ZOOVCH","drillhole":"USR_DIAG_TEST","rows":[{"lithoFrom":5,"lithoTo":10,"lithoCode":"0--","colorCode":"10G4/2","redoxCode":"0042_MN1","ca":"","om":"","ox":"","sedim":"","granulo":"","hardness":"","lithologyComments":"usr diagnose"}]}';
SELECT DISTINCT usr AS StoredUsr, FileName AS StoredFileName, SUSER_SNAME() AS YourLogin
FROM [MyApps].[CoreDescrData]
WHERE HOLEID = 'USR_DIAG_TEST';
ROLLBACK;
GO

-- D7. What your last web upload stored. Fill in its drillhole and file name.
--     Note: rows uploaded BEFORE the fix stay 'userAcquire'; re-uploading the
--     same drillhole adds new rows instead of changing them (usr is part of
--     the match key). Look at the rows of the newest upload only.
/*
SELECT FileName, usr, COUNT(*) AS RowTotal
FROM [MyApps].[CoreDescrData]
WHERE HOLEID = '<drillhole you uploaded>'
GROUP BY FileName, usr
ORDER BY FileName, usr;
*/
GO

-- D8. MyApps.CoreDescrData: everything about the table (read-only).

-- D8a. Columns: type, size, nullable, default, identity/computed.
SELECT c.column_id,
       c.name                                  AS ColumnName,
       TYPE_NAME(c.user_type_id)               AS DataType,
       CASE WHEN TYPE_NAME(c.user_type_id) IN (N'nvarchar', N'nchar') AND c.max_length > 0
            THEN c.max_length / 2 ELSE c.max_length END AS MaxLength,   -- -1 = max
       c.precision, c.scale,
       c.is_nullable, c.is_identity, c.is_computed,
       dc.definition                           AS DefaultValue,
       c.collation_name
FROM sys.columns AS c
LEFT JOIN sys.default_constraints AS dc
       ON dc.parent_object_id = c.object_id AND dc.parent_column_id = c.column_id
WHERE c.object_id = OBJECT_ID(N'MyApps.CoreDescrData')
ORDER BY c.column_id;

-- D8b. Keys and indexes (primary key, unique, other indexes) with their columns.
SELECT i.name AS IndexName, i.type_desc, i.is_primary_key, i.is_unique,
       STRING_AGG(c.name, N', ') WITHIN GROUP (ORDER BY ic.key_ordinal) AS KeyColumns
FROM sys.indexes AS i
JOIN sys.index_columns AS ic ON ic.object_id = i.object_id AND ic.index_id = i.index_id
JOIN sys.columns AS c ON c.object_id = ic.object_id AND c.column_id = ic.column_id
WHERE i.object_id = OBJECT_ID(N'MyApps.CoreDescrData') AND ic.is_included_column = 0
GROUP BY i.name, i.type_desc, i.is_primary_key, i.is_unique
ORDER BY i.is_primary_key DESC, i.name;

-- D8c. Constraints (check, foreign key) on the table.
SELECT name, type_desc, OBJECT_DEFINITION(object_id) AS Definition
FROM sys.objects
WHERE parent_object_id = OBJECT_ID(N'MyApps.CoreDescrData')
  AND type IN ('C', 'F', 'UQ', 'PK', 'D');

-- D8d. Size and row count, plus the owner and creation dates.
SELECT SCHEMA_NAME(t.schema_id) AS SchemaName, t.name AS TableName,
       USER_NAME(COALESCE(t.principal_id, s.principal_id)) AS Owner,
       t.create_date, t.modify_date,
       SUM(CASE WHEN p.index_id IN (0, 1) THEN p.rows END) AS TotalRows,
       CAST(SUM(a.total_pages) * 8 / 1024.0 AS decimal(12, 2)) AS TotalMB
FROM sys.tables AS t
JOIN sys.schemas AS s ON s.schema_id = t.schema_id
JOIN sys.partitions AS p ON p.object_id = t.object_id
JOIN sys.allocation_units AS a ON a.container_id = p.partition_id
WHERE t.object_id = OBJECT_ID(N'MyApps.CoreDescrData')
GROUP BY t.schema_id, t.name, t.principal_id, s.principal_id, t.create_date, t.modify_date;

-- D8e. Who stored what: rows per usr (shows how many rows are 'userAcquire').
SELECT usr, COUNT(*) AS RowTotal, COUNT(DISTINCT HOLEID) AS Drillholes,
       SUM(CASE WHEN FileName IS NULL THEN 1 ELSE 0 END) AS RowsWithoutFileName
FROM [MyApps].[CoreDescrData]
GROUP BY usr
ORDER BY RowTotal DESC;
