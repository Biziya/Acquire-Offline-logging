# Backend API

ASP.NET Core Web API for the application backend.

## Requirements

- .NET 10 SDK or a newer SDK capable of targeting `net10.0`
- Access to the configured SQL Server database
- An ASP.NET Core HTTPS development certificate

## Restore and run

From the `BackendApi` directory:

```bash
dotnet restore
dotnet run --launch-profile https
```

Swagger UI is available in Development at:

```text
https://localhost:7047/swagger
```

## Project structure

Backend code is grouped by page. Everything belonging to the Raw Litho page
lives under a single `RawLithoPage` level in each main folder.

```text
BackendApi/
├── Controllers/
│   ├── RawLithoPage/          # CaCode, ColourCode, Drillhole, LithoCode, OmCode,
│   │                          # OmFaciesCode, OxCode, PyCode, RedoxCode, SedimCode
│   ├── CurrentUser/           # GET /api/currentuser (Windows Authentication)
│   ├── Status/
│   └── UploadData/
│
├── Repositories/
│   ├── RawLithoPage/          # one folder per API, each with I<Name>Repository + <Name>Repository
│   └── UploadData/            # IUploadDataRepository + UploadDataRepository
│
├── Models/
│   ├── CurrentUser/
│   ├── RawLithoPage/          # DTOs / responses for the Raw Litho endpoints
│   ├── Status/
│   └── UploadData/
│
└── Data/                      # small shared data-access helpers
```

Namespaces mirror the folders, for example:

```csharp
namespace BackendApi.Controllers.RawLithoPage;
namespace BackendApi.Repositories.RawLithoPage.CaCode;
namespace BackendApi.Models.RawLithoPage;
```

## Current user endpoint

`GET /api/currentuser` returns the Windows user calling the API, proven by
Windows Integrated Authentication (`Microsoft.AspNetCore.Authentication.Negotiate`:
Kerberos or NTLM). The frontend shows it in the sidebar and uses it for
`created_by`, `edited_by` and Upload Data's "Imported By".

```json
{ "userName": "Bek" }            // local account (computer prefix dropped)
{ "userName": "COMPANY\\bek" }   // domain account
```

- Only this endpoint has `[Authorize]`. No fallback policy is set, so every
  other endpoint stays anonymous, exactly as before.
- Without Windows credentials the response is `401` with
  `WWW-Authenticate: Negotiate`; browsers then authenticate automatically for
  `localhost` / Local intranet sites.
- Test from PowerShell on the same PC:
  `Invoke-RestMethod http://localhost:7047/api/currentuser -UseDefaultCredentials`.
- Hosted in IIS instead of Kestrel: enable Windows Authentication for the site
  (and keep Anonymous Authentication on for the other endpoints).

## Drillholes endpoint

```text
GET /api/drillholes
```

The endpoint reads the `DefaultConnection` connection string from configuration
and returns a plain JSON array. An empty database result is returned as `[]` with
HTTP `200 OK`. Database failures return HTTP `500 Internal Server Error` with a
safe JSON error response.

Example response:

```json
[
  {
    "holeId": "DH001",
    "projectCode": "PROJECT-A",
    "campaign": "2026"
  }
]
```

Test it through Swagger or the request included in `BackendApi.http`.

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

Every result set the procedure returns is read to the end so that an error
raised by a later statement still fails the request. The API does not report
inserted/updated counts: the procedure does not return them.

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

The API still sends `@usr`, but only a name the server verified
(`User.Identity`); a user name sent by the client is never used. The upload
endpoint is anonymous, like every endpoint except `/api/currentuser`, so `@usr`
is normally `NULL`. Recording the real importer would need both a procedure
change (use `@usr` instead of `SUSER_NAME()`) and `[Authorize]` on this
endpoint. Neither is done here: the procedure is unchanged, and adding
`[Authorize]` would make the upload fail for anyone whose browser does not send
Windows credentials. Until then, anyone who can reach the API can upload.

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

### Database configuration

The endpoint uses the existing `DefaultConnection`: `Data Source=BMNULAADB02;
Initial Catalog=ACQMN01`, SQL login `userAcquire` (both appsettings files; no
environment variable, user-secrets or other override is configured). The
procedure therefore runs in **ACQMN01**, and the latest error confirms it
writes `ACQMN01.MyApps.CoreDescrData`. Earlier logs named `ACQMN01_DEV`,
which this configuration never pointed to. **Confirm the intended destination
with the database team before any write test**; if it is `ACQMN01_DEV`, only
the connection string's `Initial Catalog` changes.

Under the company security model the application login may only execute the
procedure: it sends no INSERT/UPDATE/DELETE of its own and needs no table
permissions.

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

Automated tests live in `../BackendApi.Tests` (xUnit). They cover the
validator and the endpoint through the real ASP.NET Core pipeline with a fake
repository, plus the real repository against an unreachable server (safe
`500`). They never connect to a real database.

```bash
dotnet test ../BackendApi.Tests
```

Manual check against an approved development database:

1. `dotnet run --launch-profile https`, then open Swagger at the URL printed
   on start-up (`https://localhost:5237/swagger` or
   `http://localhost:7047/swagger`, per `Properties/launchSettings.json`).
2. `POST /api/upload-data` with a valid export → `200`, `totalRows` = rows in
   the file. Check `CoreDescrData` for the drillhole.
3. Upload the same file again → row count for that `HOLEID` unchanged.
4. Change one value (e.g. a `lithoCode`), upload → that row's `VALUE` updated.

The request in `BackendApi.http` can be used instead of Swagger.

## Build verification

```bash
dotnet restore
dotnet build
dotnet test ../BackendApi.Tests
```
