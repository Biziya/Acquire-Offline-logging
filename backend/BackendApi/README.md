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
| 3 | Upload Data | `POST /api/upload-data` | `ACQMN01` (procedure) | Store an exported lithology JSON |
| 4 | Data Viewer | `GET /api/dataviewer/drillholes` | `ACQMN01` (`MyApps.CoreDescrData`) | Drillholes that have stored records |
|   |  | `GET /api/dataviewer?drillhole=…` | `ACQMN01` (`MyApps.CoreDescrData`) | Stored intervals of one drillhole |
| 5 | Status | `GET /api/status` | — | Backend online check; the verified Windows user with `?includeUser=true` |

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
appsettings.json              CoreDescrData:UseWindowsAuthentication  false   (IIS: SQL login userAcquire)
appsettings.Development.json  CoreDescrData:UseWindowsAuthentication  true    (dotnet run: your Windows account)
```

- Drillholes and Table Constants use `DefaultConnection` as it is (`ACQMN01`,
  SQL login `userAcquire`).
- Upload Data and Data Viewer work on `MyApps.CoreDescrData`. They use
  `DefaultConnection`, with the database replaced by `CoreDescrData:Database`
  when that is set (unset: `ACQMN01`;
  `ConfigurationExtensions.GetCoreDescrDataConnectionString`).
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
- On IIS the app pool runs as `ApplicationPoolIdentity`, which reaches SQL
  Server as the computer account `BDOM\BMNDULAAS01$` (no login: error 18456).
  So `appsettings.json` keeps Windows authentication **off** and the API uses
  `userAcquire`, which needs the database fix in *Troubleshooting: error 229*.
  IIS runs in the `Production` environment, so `appsettings.Development.json`
  does not apply there; do not copy it over `appsettings.json`.
  `ConnectionConfigurationTests` fails the build if `appsettings.json` ever
  turns Windows authentication back on.
- At startup the API logs the environment and the CoreDescrData connection
  without the password, e.g.
  `Environment Production; CoreDescrData connection: BMNULAADB02/ACQMN01, SQL login userAcquire`.
  On IIS the log appears in the stdout log when `stdoutLogEnabled` is on in
  `web.config`, or in the Windows Event Log. `Windows authentication as …` or
  `Environment Development` there means the wrong settings are in effect.

### Production password

The password should not live in Git. On the server, set the whole connection
string as an environment variable of the IIS site. It overrides
`appsettings.json`, and a publish does not overwrite it (unlike `web.config`):

```text
IIS Manager → AcQuireBackend → Configuration Editor
  section: system.webServer/aspNetCore   (From: ApplicationHost.config <location path='AcQuireBackend'>)
  environmentVariables → Add
    name:  ConnectionStrings__DefaultConnection
    value: Data Source=BMNULAADB02;Initial Catalog=ACQMN01;User ID=userAcquire;Password=<from the DBA>;Encrypt=True;TrustServerCertificate=True;
```

Do not set `ASPNETCORE_ENVIRONMENT=Development` or
`CoreDescrData__UseWindowsAuthentication=true` there. Recycle the app pool
afterwards.

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
query, filtered by `HOLEID` (`DrillholeRepository.GetByHoleIdAsync`), for
Campaign only; its drillhole selector uses `GET /api/dataviewer/drillholes`.

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

Read-only. Both routes read `MyApps.CoreDescrData` in the
`CoreDescrData:Database` (unset: `ACQMN01`) through the same connection as
Upload Data, with parameterised `SELECT`s only. Opening the Data Viewer never
writes anything.

```text
Controllers/DataViewer/DataViewerController.cs     HTTP, Project / Campaign
Repositories/DataViewer/DataViewerRepository.cs    the two SELECTs
Repositories/DataViewer/DataViewerIntervals.cs     NAME / VALUE rows → intervals
Models/DataViewer/DataViewerResponse.cs            response and row models
```

### Drillholes with stored records

```text
GET /api/dataviewer/drillholes
```

```sql
SELECT DISTINCT [HOLEID]
FROM [MyApps].[CoreDescrData]
WHERE [HOLEID] IS NOT NULL
  AND LTRIM(RTRIM([HOLEID])) <> ''
ORDER BY [HOLEID];
```

```json
[ "GTZO_0001_1", "GTZO_0002_1" ]
```

Empty table: `[]` with `200`. Database failure: `500
{ "error": "Unable to retrieve drillholes." }`.

### One drillhole

```text
GET /api/dataviewer?drillhole=GTZO_0001_1
```

```sql
SELECT [HOLEID], [PROJECTCODE], [FROM], [TO], [PRIORITY], [NAME], [VALUE],
       [COMMENT_VALUE], [CONSISTENTCHECK], [usr], [FileName], [PathName]
FROM [MyApps].[CoreDescrData]
WHERE [HOLEID] = @Drillhole            -- varchar(20)
ORDER BY [FROM], [TO], [PRIORITY], [PROJECTCODE], [usr], [NAME];
```

Only the selected drillhole's rows are read; then, if it has any, one more
query for its Campaign (below). Two queries per request, whatever the number
of intervals or projects.

```json
{
  "drillhole": "GTZO_0001_1",
  "project": "ZOOVCH",
  "campaign": "2015",
  "projects": [ { "projectCode": "ZOOVCH", "campaign": "2015" } ],
  "totalIntervals": 1,
  "totalRecords": 3,
  "hiddenValues": 0,
  "storedBy": [ "BDOM\user" ],
  "fileNames": [ "yashgaa.json" ],
  "intervals": [
    { "projectCode": "ZOOVCH", "lithoFrom": 5.0, "lithoTo": 10.0, "priority": 1,
      "usr": "BDOM\user",
      "values": { "lithoCode": "0--", "colorCode": "10G4/2", "lithologyComments": "Fine sand" } }
  ]
}
```

**Intervals** (`DataViewerIntervals.Build`). The procedure stores one row per
interval and attribute and matches rows on `HOLEID`, `PROJECTCODE`, `FROM`,
`TO`, `PRIORITY`, `NAME`, `usr`. So rows sharing `PROJECTCODE`, `FROM`, `TO`,
`PRIORITY` and `usr` are one interval; another priority or login is another
row, never merged. `NAME` → Raw Litho field is the upload mapping read
backwards (see *JSON → database mapping*; names compared case-insensitively):

| `NAME` | `values` key | Value |
| --- | --- | --- |
| `LithoFacies` | `lithoCode` | `VALUE` |
| `Colour` | `colorCode` | `VALUE` |
| `RedoxFacies` | `redoxCode` | `VALUE` |
| `CA` / `OM` / `OX` | `ca` / `om` / `ox` | `VALUE` |
| `InternalStructure` | `sedim` | `VALUE` |
| `Granulo` / `Hardness` | `granulo` / `hardness` | `VALUE` |
| `LithologyComments` | `lithologyComments` | `COMMENT_VALUE`, or `VALUE` when that is empty |

- `[FROM]` / `[TO]` are returned as `lithoFrom` / `lithoTo` in their SQL type
  (no rounding); `5.0` and `5.00` are the same interval.
- An attribute that is not stored is absent from `values`; `NULL` is `null`.
  Nothing is filled in. `omFacies` and `py` are never present: the procedure
  does not store them.
- A row whose `NAME` has no Raw Litho field, or repeats one already placed in
  the interval, is counted in `hiddenValues` instead of being dropped silently.
- `totalRecords` is the number of `CoreDescrData` rows read.

**Project / Campaign.** `projects` lists every distinct stored `PROJECTCODE`
of the drillhole (trimmed, case-insensitive). Campaign is not in
`CoreDescrData`: it comes from the Drillholes query (`ZOOVCH_COLLAR_LIST`,
`RIGHT(PROSPECT, 4)`) for the same `HOLEID`, matched on `PROJECTCODE` too,
because a `HOLEID` may belong to several projects. Exactly one campaign: it;
none or several: `null` (several is logged). The lookup is not a SQL join
because `CoreDescrData:Database` may point at another database. If the lookup
itself fails, it is logged and Campaign is `null`; the records are still
returned. `project` / `campaign` are filled only when there is exactly one
project, otherwise `null` (the frontend then lists `projects`).

- No stored rows: `200` with `"totalIntervals": 0`, `"intervals": []`,
  `"projects": []`.
- Missing or blank `drillhole`, or longer than 20 characters (`HOLEID` is
  written through `@Hole varchar(20)`): `400 { "error": "…" }`.
- Database failure: `500 { "error": "Unable to retrieve drillhole records." }`;
  details are logged only.

**Permissions.** These `SELECT`s run as the CoreDescrData connection's login
(see *Database configuration*), which needs `SELECT` on
`MyApps.CoreDescrData` (Upload Data only needs `EXECUTE` on the procedure).

## Status

```text
GET /api/status                    anonymous, polled by the sidebar every 5 s
GET /api/status?includeUser=true   Windows Integrated Authentication
```

```json
{ "status": "online", "message": "Backend connection successful" }
{ "status": "online", "message": "Backend connection successful", "userName": "COMPANY\\bek" }
```

## Identity (current user)

A browser cannot read the Windows login, so the backend proves it, on the
existing Status route (no sixth API): `GET /api/status?includeUser=true`
answers an unauthenticated request with `401` + `WWW-Authenticate: Negotiate`;
the browser then authenticates the signed-in Windows user automatically
(Kerberos or NTLM, `Microsoft.AspNetCore.Authentication.Negotiate`) and the
response adds `userName`:

| Account | Windows reports | `userName` |
| --- | --- | --- |
| Domain | `COMPANY\bek` | `COMPANY\bek` |
| Local | `DESKTOP-1\Bek` | `Bek` (this computer's name is dropped) |

- Only a name proven by Windows is returned; nothing the client sends is
  used. No credentials or other OS details are returned.
- Besides this, only `POST /api/upload-data` requires authentication (it takes
  the uploader from it); plain `/api/status` and the other APIs stay anonymous.
- The frontend asks once (`frontend/src/services/currentUser.ts`) and uses the
  name for the sidebar, `created_by`, `edited_by` and Upload Data's
  "Imported By". Without Windows credentials (another browser zone, a
  non-Windows client) it shows "User not identified" — never a guess.
- Browsers send Windows credentials automatically to `localhost` and Local
  intranet sites; another host name must be in the Local intranet zone (or an
  `AuthServerAllowlist` policy). Hosted in IIS: enable Windows Authentication
  and keep Anonymous Authentication on.
- Check from PowerShell on the same PC:
  `Invoke-RestMethod 'http://localhost:7047/api/status?includeUser=true' -UseDefaultCredentials`.

Upload Data sends the same verified user to the procedure as `@usr`; see
*Uploader identity and authorization* below.

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
| `@usr` | `varchar(50)` | the verified Windows user (`DOMAIN\user`), see *Uploader identity* |
| `@fileName` | `varchar(50)` | the uploaded file name (no path) |
| `@str_json` | `nvarchar(max)` | the filtered JSON (step 4 above) |

The call runs in one `SqlTransaction`, like the SSMS test (`BEGIN TRAN` →
`EXEC` → `COMMIT`):

1. Open the connection and check it is on the configured upload database
   (otherwise nothing runs).
2. `BEGIN TRANSACTION`; log the Windows user, `DB_NAME()`, `SUSER_SNAME()` and `USER_NAME()`
   (the SQL login the procedure runs as).
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
`[ACQMN01].[MyApps].[CoreDescrData]` (`HOLEID`, `PROJECTCODE`, `FROM`,
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

### Uploader identity and authorization (`usr`)

```text
browser ──Negotiate (Kerberos/NTLM)──▶ API: User.Identity.Name = "BDOM\jsmith"
API ──SQL login userAcquire──▶ EXEC … @usr = 'BDOM\jsmith'
procedure: is BDOM\jsmith in the uploaders' AD group?  no → THROW 51001 (nothing inserted)
                                                       yes → insert/update, usr = 'BDOM\jsmith'
```

- `POST /api/upload-data` requires Windows Integrated Authentication. An
  anonymous request gets `401` + `WWW-Authenticate: Negotiate` and the
  database is not called. The other endpoints stay anonymous.
- `@usr` is the full verified `DOMAIN\user` (a local account keeps its
  computer name). `created_by` / `edited_by` in the file, or any form field,
  are never used as the uploader.
- The decision is SQL Server's: the procedure checks `@usr` against the
  uploaders' AD group (`xp_logininfo`) and raises error **51001** when the
  user is not a member. The API rolls back and answers `403`
  "`<user>` is not authorized to upload data. Contact the database
  administrator." Other SQL errors stay `500` without details.
- The SQL connection stays `userAcquire`: no impersonation, no delegation.
  SQL Server therefore trusts the API to pass the verified name; keep the
  `userAcquire` password out of Git (see *Production password*).

**Database side (not applied by this repository):**
`Sql/UploadDataUserAuthorization.sql` holds the read-only checks, the
procedure change (stop `SELECT @usr = SUSER_NAME();`, add the group check),
the `xp_logininfo` grant and development-only tests. Until a DBA applies it,
the procedure still replaces `@usr` with `SUSER_NAME()` (`usr` =
`userAcquire`) and authorizes everyone the API lets through.

**Careful with `usr` in the match key:** once `usr` is the real user,
re-uploading a drillhole stored under `userAcquire` adds rows instead of
updating them (see *Duplicates and updates*). The script lists those
drillholes; what to do with them is a decision for the data owners.

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
connection (`ACQMN01`). After opening, the repository checks the
connection really is on that database and refuses to run otherwise, so an
upload never lands silently in another database. Each upload logs server, database,
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
and the duplicate-matching key). If direct grants are approved anyway, the
script's B3 grants `SELECT, INSERT, UPDATE` on that one table (not the whole
`MyApps` schema).

### Known limitations of the procedure

- Until `Sql/UploadDataUserAuthorization.sql` is applied, `usr` is `SUSER_NAME()` and no group is checked (see above).
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

- `ApiRoutesTests`: exactly the six routes of the five APIs; removed routes
  return `404`.
- `ConnectionConfigurationTests`: `appsettings.json` (Production) uses the
  SQL login `userAcquire` with encryption; Windows authentication on/off;
  the logged description never contains the password.
- `TableConstants/`: `FIELDNAME` to list grouping, response keys and item
  names, safe `500`.
- `DataViewer/`: the drillhole list (filled, empty, safe `500`); NAME / VALUE
  rows → intervals (every mapped NAME, comments from `COMMENT_VALUE`,
  priorities / projects / logins kept apart, depth scale, missing and NULL
  values, unknown and repeated NAMEs counted); Project / Campaign matched on
  HOLEID + PROJECTCODE (single, matching, conflicting, missing, several
  projects, failed lookup); empty result, `400` for a missing or too-long
  drillhole, safe `500`.
- `UploadData/`: validation, filtering, one procedure call, error 229 and
  other SQL errors, an unreachable server; anonymous upload → 401 without a
  database call, the verified user (not `created_by`, `edited_by` or a form
  field) sent as `@usr`, error 51001 → 403, an over-long user name → 400.

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

5. `GET /api/dataviewer/drillholes` lists the drillhole;
   `GET /api/dataviewer?drillhole=<HOLEID>` shows one interval per uploaded
   row, with the file's values.

The requests in `BackendApi.http` can be used instead of Swagger.

## Build verification

```bash
dotnet restore
dotnet build
dotnet test ../BackendApi.Tests
dotnet publish -c Release -o release
```
