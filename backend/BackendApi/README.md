# Backend API

ASP.NET Core Web API for the application backend.

## Requirements

- .NET 10 SDK or a newer SDK capable of targeting `net10.0`
- Access to the configured SQL Server database

## Restore and run

From the `BackendApi` directory (the app is used over HTTP):

```bash
dotnet restore
dotnet run --launch-profile http
```

Swagger UI is available in Development at:

```text
http://localhost:7047/swagger
```

## The five APIs

| # | API | Method and route | Database | Purpose |
| --- | --- | --- | --- | --- |
| 1 | Drillholes | `GET /api/drillholes` | `ACQMN01` (`ZOOVCH_COLLAR_LIST`) | Every drillhole with Project and Campaign |
| 2 | Table Constants | `GET /api/table-constants` | `ACQMN01` (`QV_VS_LOOKUP_RO`) | All nine Raw Litho lookup lists |
| 3 | Upload Data | `POST /api/upload-data` | `ACQMN01_DEV` (procedure) | Store an exported lithology JSON |
| 4 | Data Viewer | `GET /api/dataviewer?drillhole=…` | `ACQMN01_DEV` (`MyApps.CoreDescrData`) | Stored records of one drillhole |
| 5 | Status | `GET /api/status` | — | Backend online check |

No other application route exists (Swagger is Development-only
infrastructure). `ApiRoutesTests` fails if a route is added or one of the
removed ones returns. Removed: `GET /api/currentuser`, the nine lookup routes
(`/api/lithocodes`, `/api/colour`, `/api/ca`, `/api/om`, `/api/omfacies`,
`/api/py`, `/api/ox`, `/api/sedim`, `/api/redoxcode`) and `/api/uploaddata`.

## Project structure

One folder per API in each main folder; namespaces mirror the folders
(`BackendApi.Controllers.DataViewer`, `BackendApi.Repositories.DataViewer`, …).

```text
BackendApi/
├── Controllers/
│   ├── Drillholes/       DrillholesController
│   ├── TableConstants/   TableConstantsController
│   ├── UploadData/       UploadDataController, UploadDataValidator
│   ├── DataViewer/       DataViewerController
│   └── Status/           StatusController
├── Repositories/         one I<Name>Repository + <Name>Repository per API
│   ├── Drillholes/       (no Status folder: Status reads no data)
│   ├── TableConstants/
│   ├── UploadData/
│   └── DataViewer/
├── Models/
│   ├── Drillholes/  TableConstants/  UploadData/  DataViewer/  Status/
└── Data/                 shared helpers: connection strings, reader helpers
```

Database access uses `Microsoft.Data.SqlClient` only, always parameterised.

## Database configuration

```text
appsettings.json              ConnectionStrings:DefaultConnection   Data Source=BMNULAADB02; Initial Catalog=ACQMN01; User ID=userAcquire; …
appsettings.json              CoreDescrData:Database                ACQMN01_DEV
appsettings.Development.json  CoreDescrData:UseWindowsAuthentication  true
```

- Drillholes and Table Constants use `DefaultConnection` as it is (`ACQMN01`,
  SQL login `userAcquire`).
- Upload Data and Data Viewer work on `MyApps.CoreDescrData`. They use
  `DefaultConnection` with only the database replaced by
  `CoreDescrData:Database` (`ConfigurationExtensions.GetCoreDescrDataConnectionString`).
  No second connection string, no credentials in code.
- With `CoreDescrData:UseWindowsAuthentication` (Development), those two
  connect with `Integrated Security=True` as the Windows account running the
  API (`dotnet run` / `dotnet watch` in your session = you), with no password
  anywhere. `userAcquire` is not allowed to run the upload procedure's INSERT
  (error 229, see below); a Windows account with the rights works. Hosted
  (IIS, service), the API runs as its service account, which then needs
  `EXECUTE` on `dbo.InsertUpdateCoreDescr_WellCAD` (Upload Data) and `SELECT`
  on `MyApps.CoreDescrData`, or an approved read-only view or procedure in its
  place (Data Viewer).

## Drillholes

```text
GET /api/drillholes
```

```sql
SELECT HOLEID, PROJECTCODE, RIGHT(PROSPECT, 4) AS CAMPAIGN FROM ZOOVCH_COLLAR_LIST;
```

```json
[ { "holeId": "GTZO_0001_1", "projectCode": "ZOOVCH", "campaign": "2015" } ]
```

An empty result is `[]` with `200`. Database failures return `500` with
`{ "error": "Unable to retrieve drillholes." }`. Data Viewer reuses the same
query, filtered by `HOLEID` (`DrillholeRepository.GetByHoleIdAsync`).

## Table Constants

```text
GET /api/table-constants
```

Replaces the nine lookup endpoints with one query on `QV_VS_LOOKUP_RO` (same
view, same `FIELDNAME`s). Each list keeps the item shape its old endpoint
returned, so codes, descriptions and field names are unchanged:

| Key | `FIELDNAME` | Item | Old route |
| --- | --- | --- | --- |
| `caCode` | `Min1Qty` | `{ "caCode", "description" }` | `/api/ca` |
| `colourCode` | `Colour` | `{ "colourCode", "description" }` | `/api/colour` |
| `lithoCode` | `LithoFacies` | `{ "lithoCode", "description" }` | `/api/lithocodes` |
| `omCode` | `Min2Qty` | `{ "omCode", "description" }` | `/api/om` |
| `omFaciesCode` | `OM_Facies` | `{ "omFaciesCode", "description" }` | `/api/omfacies` |
| `oxCode` | `Min4Qty` | `{ "oxCode", "description" }` | `/api/ox` |
| `pyCode` | `Min3Qty` | `{ "pyCode", "description" }` | `/api/py` |
| `redoxCode` | `RedoxFacies` | `{ "redoxCode", "description" }` | `/api/redoxcode` |
| `sedimCode` | `InternalStructure` | `{ "sedimCode", "description" }` | `/api/sedim` |

```json
{
  "caCode":      [ { "caCode": "1", "description": "…" } ],
  "colourCode":  [ { "colourCode": "10G4/2", "description": "…" } ],
  "lithoCode":   [ { "lithoCode": "0--", "description": "…" } ],
  "omCode": [], "omFaciesCode": [], "oxCode": [], "pyCode": [], "redoxCode": [], "sedimCode": []
}
```

Database failures return `500` with `{ "error": "Unable to retrieve table constants." }`.

## Data Viewer

```text
GET /api/dataviewer?drillhole=GTZO_0001_1
```

Read-only. Drillhole = `HOLEID`. Reads `MyApps.CoreDescrData` in the
`CoreDescrData:Database` (`ACQMN01_DEV`), parameterised, ordered by
`[FROM], [TO], [PRIORITY], [NAME]`:

```sql
SELECT [HOLEID], [PROJECTCODE], [FROM], [TO], [PRIORITY], [NAME], [VALUE],
       [COMMENT_VALUE], [CONSISTENTCHECK], [usr], [FileName], [PathName],
       [Created_at], [Modified_at], [Imported_by]
FROM [MyApps].[CoreDescrData]
WHERE [HOLEID] = @Drillhole;
```

```json
{
  "drillhole": "GTZO_0001_1",
  "project": "ZOOVCH",
  "campaign": "2015",
  "totalRecords": 1,
  "records": [
    { "holeId": "GTZO_0001_1", "projectCode": "ZOOVCH", "from": 5.0, "to": 10.0,
      "priority": 1, "name": "LithoFacies", "value": "0--", "commentValue": null,
      "consistentCheck": null, "usr": "DOMAIN\\user", "fileName": "yashgaa.json",
      "pathName": null, "createdAt": "2026-10-22T10:00:00", "modifiedAt": null,
      "importedBy": null }
  ]
}
```

- Values are returned as stored: numbers stay numbers, dates become ISO text,
  `NULL` stays `null`. Nothing is filled in or converted.
- **Project / Campaign** come from the Drillholes query for the same `HOLEID`
  (Campaign is not in `CoreDescrData`; the two tables are in different
  databases, so they are looked up, not joined). One entry: its values.
  Several entries: the one whose project matches the stored rows'
  `PROJECTCODE`; still ambiguous: `campaign` is `null` (logged, never guessed).
  No entry: `project` from the stored rows if they agree on one, `campaign` `null`.
- No stored rows: `200` with `"totalRecords": 0, "records": []`.
- Missing or blank `drillhole`, or longer than 20 characters (`HOLEID` is
  written through `@Hole varchar(20)`): `400 { "error": "…" }`.
- Database failure: `500 { "error": "Unable to retrieve drillhole records." }`;
  details are logged only.

## Status

`GET /api/status` returns `{ "status": "online", "message": "Backend connection successful" }`.

## Identity (current user)

`GET /api/currentuser` and the Windows Integrated Authentication behind it
(`Microsoft.AspNetCore.Authentication.Negotiate`) were removed: no API needs
authentication now. The frontend owns identity resolution
(`frontend/src/services/currentUser.ts`), but a browser cannot read the
Windows login and the app has no SSO provider, so it currently has **no
verified user**: the sidebar shows "User not identified", Upload Data's
Imported By shows "—", and `created_by` / `edited_by` are no longer set on new
documents and edits. Restoring them needs a trusted identity source (for
example an SSO token issued to the app, or an authenticated endpoint); a name
typed or sent by the browser is never treated as an identity.

The database records the SQL login instead: the upload procedure stores
`SUSER_NAME()` in `usr` (see below).

## Upload Data endpoint

```text
POST /api/upload-data
Content-Type: multipart/form-data
file = <exported lithology .json file>
```

Uploads one exported Raw Litho JSON document (the format the frontend exports,
e.g. `frontend/src/other/raw-lithology-test.json`) through the existing stored
procedure. All inserts and updates happen inside the procedure; the API does
no SQL INSERT/UPDATE of its own. The frontend uploads the original export;
the backend validates it and sends the procedure only the fields it stores.

```text
Controllers/UploadData/UploadDataController.cs   HTTP: file checks, responses
Controllers/UploadData/UploadDataValidator.cs    validation + the filtered procedure JSON
Repositories/UploadData/UploadDataRepository.cs  the one stored procedure call
Models/UploadData/UploadDataRequest.cs           the procedure's parameter values
Models/UploadData/UploadDataResponse.cs          every response body
```

### Request flow

1. A file is required (`400` otherwise), at most `UploadData:MaxFileSizeBytes`
   (`appsettings.json`, default 10 MB; `413` otherwise), named `*.json`, with a
   name of at most 50 characters (`@fileName varchar(50)`).
2. The content must be valid UTF-8 JSON (`400 Invalid JSON file.`).
3. The document is validated (`400 Invalid lithology data.` with `errors`):
   - `project` and `drillhole` are non-empty text; `drillhole` is at most 20
     characters (`@Hole varchar(20)`);
   - `rows` is a non-empty array of objects;
   - each row's `lithoFrom` and `lithoTo` are present and are plain decimal
     numbers, as JSON numbers or numeric strings (`"5"`, `"12.75"`; no exponent
     or thousands separator), with `lithoFrom < lithoTo`;
   - each stored attribute (`lithoCode`, `colorCode`, `redoxCode`, `ca`, `om`,
     `ox`, `sedim`, `granulo`, `hardness`, `lithologyComments`) is text, `null`
     or missing. Empty strings are valid and are passed on as empty strings.

   Errors name the row (`Row 3: lithoFrom must be less than lithoTo.`); the
   first 20 are listed, then `…and N more errors.`. Nothing is truncated or
   converted. An invalid file never reaches the database.
4. A **filtered copy** is built for the procedure (the uploaded file itself is
   not changed) and passed in a single call for the whole document (never once
   per row):
   - top level: `project`, `drillhole`, `rows` only;
   - each row: `lithoFrom`, `lithoTo` (as JSON numbers, value unchanged:
     `"12.50"` → `12.50`) and the ten stored attributes, under their original
     names and with their original values. An attribute missing from the
     upload stays missing (the procedure reads `NULL`); `""` stays `""`;
     nothing is defaulted, trimmed or invented.

   ```json
   { "project": "ZOOVCH", "drillhole": "GTZO_0001_1", "rows": [
     { "lithoFrom": 5, "lithoTo": 10, "lithoCode": "0--", "colorCode": "10G4/2",
       "redoxCode": "0042_MN1", "ca": "", "om": "", "ox": "", "sedim": "",
       "granulo": "", "hardness": "", "lithologyComments": "" } ] }
   ```

### Stored procedure call

`UploadDataRepository` runs `dbo.InsertUpdateCoreDescr_WellCAD` with
`Microsoft.Data.SqlClient`, `CommandType.StoredProcedure`, explicitly typed
parameters, async calls and the request's cancellation token (command timeout
120 s):

| Parameter | Type | Value |
| --- | --- | --- |
| `@Action` | `varchar(50)` | `'Raw core import_JSON'` |
| `@Hole` | `varchar(20)` | the JSON `drillhole` |
| `@usr` | `varchar(50)` | the authenticated web user, or `NULL` (see below) |
| `@fileName` | `varchar(50)` | the uploaded file name (no path) |
| `@str_json` | `nvarchar(max)` | the filtered JSON (step 4 above) |

The call runs in one `SqlTransaction`, like the SSMS test (`BEGIN TRAN` →
`EXEC` → `COMMIT`):

1. Open the connection and check it is on the configured upload database
   (otherwise nothing runs).
2. `BEGIN TRANSACTION`; log `DB_NAME()`, `SUSER_SNAME()` and `USER_NAME()`
   (the SQL login is also what the procedure stores in `usr`).
3. Execute the procedure once and read every result set it returns to the
   end, so an error raised by a later statement still fails the request.
4. `COMMIT` — not cancellable once the procedure has finished. Only then is
   success returned.
5. On any error: `ROLLBACK` if the transaction is still open (the procedure
   uses `XACT_ABORT ON`, so SQL Server may already have rolled it back), log,
   rethrow; the API returns a failure.

The API does not report inserted/updated counts (the procedure does not
return them) and does not read `CoreDescrData` to verify: under the security
policy the login may only execute the procedure. Verify with Section G of
`SQLTests/Test_UploadData_StoredProcedure.sql`.

### JSON → database mapping

The procedure's `Raw core import_JSON` branch writes to
`[ACQMN01_DEV].[MyApps].[CoreDescrData]` (`HOLEID`, `PROJECTCODE`, `FROM`,
`TO`, `PRIORITY`, `NAME`, `VALUE`, `COMMENT_VALUE`, `CONSISTENTCHECK`, `usr`,
`FileName`, `PathName`), one row per interval and attribute (`NAME`/`VALUE`):

| JSON field | Stored as |
| --- | --- |
| `drillhole` | `HOLEID` |
| `project` | `PROJECTCODE` |
| `lithoFrom` | `FROM` |
| `lithoTo` | `TO` |
| `lithoCode` | `NAME = 'LithoFacies'` |
| `colorCode` | `NAME = 'Colour'` |
| `redoxCode` | `NAME = 'RedoxFacies'` |
| `ca` | `NAME = 'CA'` |
| `om` | `NAME = 'OM'` |
| `ox` | `NAME = 'OX'` |
| `sedim` | `NAME = 'InternalStructure'` |
| `granulo` | `NAME = 'Granulo'` |
| `hardness` | `NAME = 'Hardness'` |
| `lithologyComments` | `NAME = 'LithologyComments'` |

**Not stored** by the procedure today: `campaign`, `created_at`,
`modified_at`, `created_by`, `edited_by`, and the row fields `id`,
`extractionType`, `corePass`, `recoveryStart`, `recoveryEnd`, `coreEnd`,
`omFacies`, `py`, `lithologicalDescription`. They are accepted in the upload
but **filtered out** of `@str_json`. The procedure's `OPENJSON` also reads `py`
and `omFacies`, but its raw-import INSERT never stores them, so they are not
sent; storing them would need a procedure change.

### SQL user (`usr`) behaviour

The procedure starts with `SELECT @usr = SUSER_NAME();`, which **replaces**
whatever `@usr` the API sends. The `usr` column therefore holds the SQL Server
login of the connection (with the current `DefaultConnection`, the SQL login
`userAcquire`), not the Windows user shown as "Imported By" in the frontend.

The API sends `@usr = NULL`, as the working SSMS test did: there is no verified
web user to send, and the procedure ignores the value anyway. Recording the
real importer would need both a procedure change (use `@usr` instead of
`SUSER_NAME()`) and an authenticated, verified identity in the API. Neither is
done here. All five endpoints are anonymous: anyone who can reach the API can
upload.

### Duplicates and updates

There is no duplicate detection in the API. The procedure matches existing
rows on `HOLEID`, `PROJECTCODE`, `FROM`, `TO`, `PRIORITY`, `NAME` and `usr`:
uploading the same file again updates those rows instead of adding new ones,
and a changed value updates the matching row. Because `usr` is part of the key,
the same file uploaded under a *different* SQL login creates a second set of
rows. The API never deletes rows.

### Responses

```json
// 200 OK — totalRows is the number of JSON rows received, not database rows.
{ "success": true, "message": "Data uploaded successfully.",
  "drillhole": "GTZO_0001_1", "project": "ZOOVCH", "totalRows": 53 }

// 400 Bad Request
{ "success": false, "message": "No file was uploaded." }
{ "success": false, "message": "Only .json files are accepted." }
{ "success": false, "message": "File name must be 50 characters or fewer." }
{ "success": false, "message": "Invalid JSON file." }
{ "success": false, "message": "Invalid lithology data.",
  "errors": [ "Row 3: lithoFrom must be less than lithoTo." ] }

// 413 Payload Too Large
{ "success": false, "message": "File exceeds the 10 MB limit." }

// 500 Internal Server Error — SQL Server denied a permission (error 229 / 230)
{ "success": false,
  "message": "Database upload is blocked by SQL Server permissions. Contact the database administrator." }

// 500 Internal Server Error — any other connection or procedure failure
{ "success": false, "message": "Database upload failed." }
```

SQL Server errors, connection details and stack traces are logged on the
server (with the file name and drillhole) and never returned. A request the
client abandons cancels the database call.

### Database

See *Database configuration* above: the upload uses the `CoreDescrData`
connection (`ACQMN01_DEV`). After opening, the repository checks the
connection really is on that database and refuses to run otherwise, so an
upload never lands silently in `ACQMN01`. Each upload logs server, database,
SQL login and database user. Under the company security model the login may
only execute the procedure: the API sends no INSERT/UPDATE/DELETE of its own.

### Troubleshooting: error 229 (INSERT permission denied)

```text
The INSERT permission was denied on the object 'CoreDescrData',
database 'ACQMN01', schema 'MyApps'.   (Number 229, State 5, Class 14)
```

This is a database authorization problem, not a JSON or parameter problem:
the API returns `Database upload is blocked by SQL Server permissions. Contact
the database administrator.` (HTTP 500) and logs the SQL error number, the
procedure, the connected server/database and SQL Server's message — never the
credentials or the uploaded JSON.

The error names the **table**, so the EXECUTE check on the procedure passed;
granting EXECUTE does not fix it. The procedure ran its INSERT and SQL Server
checked it against `userAcquire`, which happens only when the ownership chain
from `dbo.InsertUpdateCoreDescr_WellCAD` to `MyApps.CoreDescrData` is broken:
the `MyApps` schema (or table) has a different owner than `dbo`, the INSERT
is dynamic SQL, or it crosses into another database. An explicit DENY on the
login matters on top of that.

`Sql/UploadDataPermissions.sql` holds read-only diagnostics that show which
case applies (destination, identity, owners, execution context, dynamic SQL,
DENYs) and the fixes for the DBA, all commented out. Recommended: **sign the
procedure with a certificate** whose user holds `SELECT, INSERT, UPDATE` on
that one table — the application login keeps `EXECUTE` only, which is exactly
the approved model. Not proposed: `db_owner`, `db_datawriter`, table or
schema grants to the application, cross-db chaining, `TRUSTWORTHY`, or
`EXECUTE AS OWNER` (it would change `SUSER_NAME()`, i.e. the `usr` column
and the duplicate-matching key).

### Known limitations of the procedure

- `usr` is always `SUSER_NAME()` (see above).
- Not every JSON field is stored (see the mapping).
- No inserted/updated counts are returned.
- Column sizes of `CoreDescrData` (e.g. `PROJECTCODE`, `VALUE`) and the
  procedure's `OPENJSON` column types were not available while this was built,
  so the API checks only the parameter sizes above. If the procedure reads
  values into shorter `OPENJSON ... WITH` columns, SQL Server truncates them
  without an error; that would have to be fixed in the procedure.
- Whether the procedure wraps its work in a transaction is not known; a
  cancelled or failed call may leave a partial upload until the file is
  uploaded again.

## Tests

Automated tests live in `../BackendApi.Tests` (xUnit), through the real
ASP.NET Core pipeline with fake repositories; they never connect to a real
database:

- `ApiRoutesTests`: exactly the five routes; removed routes return `404`.
- `TableConstants/`: `FIELDNAME` to list grouping, response keys and item
  names, safe `500`.
- `DataViewer/`: records and values as stored (NULLs kept), Project /
  Campaign resolution (single, matching, ambiguous, missing), empty result,
  `400` for a missing or too-long drillhole, safe `500`.
- `UploadData/`: validation, filtering, one procedure call, error 229 and
  other SQL errors, an unreachable server.

```bash
dotnet test ../BackendApi.Tests
```

Manual check against an approved development database:

1. `dotnet run --launch-profile http`, then open Swagger at
   `http://localhost:7047/swagger`.
2. `POST /api/upload-data` with a valid export → `200`, `totalRows` = rows in
   the file. Check `CoreDescrData` for the drillhole.
3. Upload the same file again → row count for that `HOLEID` unchanged.
4. Change one value (e.g. a `lithoCode`), upload → that row's `VALUE` updated.

5. `GET /api/dataviewer?drillhole=<HOLEID>` shows the stored rows.

The requests in `BackendApi.http` can be used instead of Swagger.

## Build verification

```bash
dotnet restore
dotnet build
dotnet test ../BackendApi.Tests
```
