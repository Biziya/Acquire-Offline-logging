# Backend API

ASP.NET Core Web API for the AcQuire Offline website. It reads drillholes and
lookup lists, stores uploaded lithology through a stored procedure, and reads
the stored records back for the Database Viewer.

## Requirements

- .NET 10 SDK, or a newer SDK that can target `net10.0`
- Access to the configured SQL Server database

## Run, test and publish

From the `BackendApi` directory:

```bash
dotnet restore
dotnet run --launch-profile http
dotnet build
dotnet test ../BackendApi.Tests
dotnet publish -c Release -o release
```

The `http` profile listens on `http://localhost:7047` in the `Development`
environment and opens Swagger at `http://localhost:7047/swagger`. Swagger is
registered in every environment. HTTPS redirection is on in Development only.
`BackendApi.http` has ready-made requests; its upload comment still names the
old procedure and `ACQMN01_DEV`.

## Endpoints

| API | Method and route | Database object | Purpose |
| --- | --- | --- | --- |
| Drillholes | `GET /api/drillholes` | `ZOOVCH_COLLAR_LIST` | Every drillhole with Project and Campaign |
| Table Constants | `GET /api/table-constants` | `QV_VS_LOOKUP_RO` | The nine Raw Litho lookup lists |
| Upload Data | `POST /api/upload-data` | `dbo.insertAcQuireOfflineBek` | Store an exported lithology JSON |
| Data Viewer | `GET /api/dataviewer/drillholes` | `MyApps.CoreDescrData` | Drillholes that have stored records |
| | `GET /api/dataviewer?drillhole=…` | `MyApps.CoreDescrData` | Stored intervals of one drillhole |
| Status | `GET /api/status` | none | Online check, plus the verified Windows user with `?includeUser=true` |

`ApiRoutesTests` fails if a route is added or a removed one comes back
(`/api/currentuser`, the nine old lookup routes such as `/api/lithocodes`, and
`/api/uploaddata`).

Code is split by API under `Controllers/`, `Repositories/` and `Models/`, with
shared helpers in `Data/` (connections, SQL error numbers), the AD group check
in `Auth/`, and DBA scripts in `Sql/`. Database access uses
`Microsoft.Data.SqlClient` with parameterised commands only.

## Configuration

| Key | `appsettings.json` | `appsettings.Development.json` | Meaning |
| --- | --- | --- | --- |
| `ConnectionStrings:DefaultConnection` | server `BMNULAADB02`, database `ACQMN01`, SQL login `userAcquire` | same | The only connection string |
| `CoreDescrData:Database` | not set | not set | Database for Upload Data and Data Viewer; unset means `DefaultConnection`'s |
| `CoreDescrData:UseWindowsAuthentication` | `false` | `true` | Upload Data and Data Viewer connect with `Integrated Security=True` |
| `Database:ImpersonateWindowsUser` | `false` | `false` | Run every database call as the browser user |
| `Auth:AllowedGroup` | `""` | `""` | AD group allowed to use the website; blank turns the check off |
| `UploadData:MaxFileSizeBytes` | not set | not set | Upload size limit, default 10 MB |

`GetRequiredConnectionString()` in `Data/ConfigurationExtensions.cs` reads
`DefaultConnection` and fails fast when it is missing. Drillholes and Table
Constants use it as it is. `GetCoreDescrDataConnectionString()` derives the
Upload Data and Data Viewer connection from it: it swaps in
`CoreDescrData:Database` when set, and drops the user and password when
`CoreDescrData:UseWindowsAuthentication` is on.

The CORS policy allows `http://10.27.27.140:5174` with credentials. That
origin is set in `Program.cs`; the `Cors:AllowedOrigins` key in the settings
files is not read.

At startup the API logs the environment and the CoreDescrData connection
without the password, for example
`Environment Production; CoreDescrData connection: BMNULAADB02/ACQMN01, SQL login userAcquire`.
`Windows authentication as …` or `Environment Development` in the server log
means the wrong settings are in effect.

### Development and IIS

With `dotnet run`, Upload Data and Data Viewer connect as your own Windows
account. On IIS the app runs in `Production`, so `appsettings.Development.json`
does not apply; do not copy it over `appsettings.json`. The app pool
(`ApplicationPoolIdentity`) reaches SQL Server as the computer account
`BDOM\BMNDULAAS01$`, which has no login (error 18456), so `appsettings.json`
keeps Windows authentication off and uses `userAcquire`.
`ConnectionConfigurationTests` fails if that changes.

The login needs `EXECUTE` on `dbo.insertAcQuireOfflineBek` (granted by
`Sql/insertAcQuireOfflineBek.sql`) and `SELECT` on `MyApps.CoreDescrData`.

### Production password

Keep the password out of Git. Set the whole connection string as an
environment variable of the IIS site. It overrides `appsettings.json`, and a
publish does not overwrite it:

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

### Website access by AD group (`Auth:AllowedGroup`)

Set the group on the server, for example `BDOM\AcQuire_Uploaders`, either in
`appsettings.Production.json` as `"Auth": { "AllowedGroup": "BDOM\\AcQuire_Uploaders" }`
or as the IIS environment variable `Auth__AllowedGroup=BDOM\AcQuire_Uploaders`.

With a group set, a request without a Windows login gets `401` with
`WWW-Authenticate: Negotiate`, and a signed-in user outside the group gets
`403`. Nested groups count. `GET /api/status` stays anonymous, and
`GET /api/status?includeUser=true` returns `200` with `"isAuthorized": true`
or `false`.

Membership comes from the Windows login token (`User.IsInRole`), so a user
just added to or removed from the group must sign out of Windows and back in.
If Windows cannot resolve the group, access is refused. The frontend
(`frontend/src/services/websiteAccess.ts`) shows an Access denied page, but
the backend enforces access. When the key is blank the API logs a warning in
Development and an error elsewhere.

## Windows authentication

The API uses Negotiate (Kerberos or NTLM).

- `GET /api/status?includeUser=true` answers an anonymous request with `401`
  and `WWW-Authenticate: Negotiate`. The browser then signs in as the current
  Windows user and the response adds the name.
- `POST /api/upload-data` always requires a Windows user.
- The other routes are anonymous unless `Auth:AllowedGroup` or
  `Database:ImpersonateWindowsUser` is set. Then every route except
  `GET /api/status` requires a Windows user.

Browsers send Windows credentials on their own to `localhost` and Local
intranet sites; other host names must be in the Local intranet zone (or an
`AuthServerAllowlist` policy). On IIS, enable Windows Authentication and keep
Anonymous Authentication on. To check from PowerShell on the same PC:

```powershell
Invoke-RestMethod 'http://localhost:7047/api/status?includeUser=true' -UseDefaultCredentials
```

### Running as the Windows user (`Database:ImpersonateWindowsUser`)

Off by default. When it is `true`, the API opens each connection with its own
account and then runs `EXECUTE AS LOGIN = N'BDOM\jsmith' WITH COOKIE INTO …`
for the verified user (`Data/DatabaseConnectionFactory.cs`). SQL Server then
checks that user's permissions and `SUSER_SNAME()` returns the user, while
`ORIGINAL_LOGIN()` still shows the service account. `REVERT WITH COOKIE` runs
before the connection goes back to the pool; if it fails, the pool is cleared.

This avoids the "double hop": the API (BMNDULAAS01) and SQL Server
(BMNULAADB02) are different machines, and Windows does not forward the user's
credentials without Kerberos constrained delegation. `EXECUTE AS LOGIN` needs
no SPN, delegation or DNS change. The DBA runs `Sql/WindowsUserImpersonation.sql`
first; on IIS set `Database__ImpersonateWindowsUser=true` as an environment
variable.

## Error handling

The read endpoints (Drillholes, Data Viewer drillholes and Table Constants)
share `DatabaseAccessDenied.ReadAsync`:

| Outcome | Status | Body |
| --- | --- | --- |
| success | `200` | the result |
| SQL Server permission error (229, 230, 916, 15406, 15517) | `403` | `{ "error": "<DOMAIN\\user> has no database permission to <action>. Contact the database administrator." }` |
| any other error | `500` | `{ "error": "<failure message>" }` |

`<action>` is `read drillholes` or `read table constants`. Without a signed-in
user the message starts with "This account". The single-drillhole Data Viewer
route uses the same 403 (`read drillhole records`) with its own 500.

SQL Server messages, connection details and stack traces are logged, never
returned. A request the client abandons cancels the database call.

## Drillholes

```sql
SELECT HOLEID, PROJECTCODE, RIGHT(PROSPECT, 4) AS CAMPAIGN FROM ZOOVCH_COLLAR_LIST;
```

```json
[ { "holeId": "GTZO_0001_1", "projectCode": "ZOOVCH", "campaign": "2015" } ]
```

An empty table returns `[]`. The 500 message is `Unable to retrieve drillholes.`

## Table Constants

One query on `QV_VS_LOOKUP_RO` returns all nine lists, keyed by list name
(with the `FIELDNAME` each reads): `caCode` (`Min1Qty`), `colourCode`
(`Colour`), `lithoCode` (`LithoFacies`), `omCode` (`Min2Qty`), `omFaciesCode`
(`OM_Facies`), `oxCode` (`Min4Qty`), `pyCode` (`Min3Qty`), `redoxCode`
(`RedoxFacies`) and `sedimCode` (`InternalStructure`). Each item holds the code
under the list's key plus `description`:

```json
{ "caCode": [ { "caCode": "1", "description": "…" } ], "lithoCode": [ { "lithoCode": "0--", "description": "…" } ], "omCode": [], … }
```

The 500 message is `Unable to retrieve table constants.`

## Data Viewer

Both routes are read-only `SELECT`s on `MyApps.CoreDescrData` through the
CoreDescrData connection.

### `GET /api/dataviewer/drillholes`

Returns the distinct, non-blank `HOLEID`s, sorted, for example
`[ "GTZO_0001_1", "GTZO_0002_1" ]`. An empty table returns `[]`. The 500
message is `Unable to retrieve drillholes.`

### `GET /api/dataviewer?drillhole=GTZO_0001_1`

```sql
SELECT [HOLEID], [PROJECTCODE], [FROM], [TO], [PRIORITY], [NAME], [VALUE],
       [COMMENT_VALUE], [CONSISTENTCHECK], [usr], [FileName], [PathName]
FROM [MyApps].[CoreDescrData]
WHERE [HOLEID] = @Drillhole            -- varchar(20)
ORDER BY [FROM], [TO], [PRIORITY], [PROJECTCODE], [usr], [NAME];
```

```json
{ "drillhole": "GTZO_0001_1", "project": "ZOOVCH", "campaign": "2015",
  "projects": [ { "projectCode": "ZOOVCH", "campaign": "2015" } ],
  "totalIntervals": 1, "totalRecords": 3, "hiddenValues": 0,
  "storedBy": [ "BDOM\\user" ], "fileNames": [],
  "intervals": [
    { "projectCode": "ZOOVCH", "lithoFrom": 5.0, "lithoTo": 10.0, "priority": 1, "usr": "BDOM\\user",
      "values": { "lithoCode": "0--", "colorCode": "10G4/2", "lithologyComments": "Fine sand" } } ] }
```

| Case | Answer |
| --- | --- |
| records found | `200` |
| no stored rows | `200` with `"totalIntervals": 0`, `"intervals": []`, `"projects": []` |
| `drillhole` missing or blank | `400 { "error": "The drillhole query parameter is required." }` |
| `drillhole` over 20 characters | `400 { "error": "drillhole must be 20 characters or fewer." }` |
| permission error | `403` (see *Error handling*) |
| other database error | `500 { "error": "Unable to retrieve drillhole records." }` |

`DataViewerIntervals.Build` groups rows that share `PROJECTCODE`, `FROM`,
`TO`, `PRIORITY` and `usr` into one interval, and maps `NAME` back to the Raw
Litho field (case-insensitive): `LithoFacies` to `lithoCode`, `Colour` to
`colorCode`, `RedoxFacies` to `redoxCode`, `CA`, `OM`, `OX` to `ca`, `om`,
`ox`, `InternalStructure` to `sedim`, `Granulo` and `Hardness` to `granulo`
and `hardness`, and `LithologyComments` to `lithologyComments` (from
`COMMENT_VALUE`, or `VALUE` when that is empty).

- Depths are returned in their SQL type without rounding.
- An attribute that is not stored is absent from `values`; `NULL` is `null`.
  `omFacies` and `py` never appear, because the procedure does not store them.
- A row whose `NAME` has no Raw Litho field, or repeats one already in the
  interval, is counted in `hiddenValues`.
- `totalRecords` is the number of rows read. `storedBy` and `fileNames` are the
  distinct `usr` and `FileName` values. `dbo.insertAcQuireOfflineBek` does not
  write `FileName`, so `fileNames` is empty for rows it stored.

Campaign is not in `CoreDescrData`. The controller reads it from the
Drillholes query for the same `HOLEID` and `PROJECTCODE`, because one
`HOLEID` can belong to several projects. One match gives the campaign; none or
several give `null` (several is logged). If the lookup fails, Campaign is
`null` and the records are still returned. `project` and `campaign` are set
only when there is exactly one project; otherwise the frontend lists
`projects`.

## Status

```text
GET /api/status                    anonymous, polled by the sidebar every 5 s
GET /api/status?includeUser=true   Windows authentication
```

```json
{ "status": "online", "message": "Backend connection successful" }
{ "status": "online", "message": "Backend connection successful",
  "userName": "COMPANY\\bek", "fullUsername": "COMPANY\\bek", "isAuthorized": true }
```

`fullUsername` is the name as Windows reports it. `userName` drops the
computer name for a local account (`DESKTOP-1\Bek` becomes `Bek`). Only a name
proven by Windows is returned. The frontend reads it once
(`frontend/src/services/currentUser.ts`) for the sidebar, `created_by`,
`edited_by` and Upload Data's Imported By.

## Upload Data

```text
POST /api/upload-data
Content-Type: multipart/form-data
file         = <exported lithology .json file>
expectedUser = <DOMAIN\user the page verified>   (optional)
```

`UploadDataController` checks the request, `UploadDataValidator` validates the
JSON and builds a filtered copy, and `UploadDataRepository` passes that copy
to the stored procedure in one call. The API runs no INSERT, UPDATE or DELETE
of its own.

### Checks, in order

1. No Windows user: `401` with `WWW-Authenticate: Negotiate`, and the database
   is not called.
2. `expectedUser` set and different from the authenticated user: `409`.
3. Windows user name over 50 characters: `400`.
4. No file or an empty file: `400`. Larger than `UploadData:MaxFileSizeBytes`:
   `413`. Not `*.json`, or a file name over 50 characters: `400`.
5. Not valid UTF-8 JSON: `400 Invalid JSON file.`
6. `400 Invalid lithology data.` with `errors` when:
   - `project` or `drillhole` is not non-empty text, or `drillhole` is over 20
     characters;
   - `rows` is not a non-empty array of objects;
   - a row's `lithoFrom` or `lithoTo` is missing or not a plain decimal number
     (a JSON number or a string such as `"12.75"`, with no exponent or
     thousands separator), or `lithoFrom` is not less than `lithoTo`;
   - a stored attribute (`lithoCode`, `colorCode`, `redoxCode`, `ca`, `om`,
     `ox`, `sedim`, `granulo`, `hardness`, `lithologyComments`) is not text,
     `null` or missing.

   Errors name the row (`Row 3: lithoFrom must be less than lithoTo.`). The
   first 20 are listed, then `…and N more errors.`

The filtered copy keeps `project`, `drillhole` and `rows`, and in each row
only `lithoFrom`, `lithoTo` (as JSON numbers) and the ten stored attributes
with their original values. Missing stays missing and `""` stays `""`.

```json
{ "project": "ZOOVCH", "drillhole": "GTZO_0001_1", "rows": [
  { "lithoFrom": 5, "lithoTo": 10, "lithoCode": "0--", "colorCode": "10G4/2",
    "redoxCode": "0042_MN1", "ca": "", "om": "", "ox": "", "sedim": "",
    "granulo": "", "hardness": "", "lithologyComments": "" } ] }
```

### Stored procedure call

| Parameter | Type | Value |
| --- | --- | --- |
| `@Action` | `varchar(50)` | `'Raw core import_JSON'` |
| `@Hole` | `varchar(20)` | the JSON `drillhole` |
| `@usr` | `varchar(50)` | the verified Windows user (`DOMAIN\user`) |
| `@fileName` | `varchar(50)` | the uploaded file name, without a path |
| `@str_json` | `nvarchar(max)` | the filtered JSON |

The repository checks that the connection is on the configured CoreDescrData
database, starts a transaction, logs the Windows user with `DB_NAME()`,
`SUSER_SNAME()`, `USER_NAME()` and `ORIGINAL_LOGIN()`, and runs the procedure
with a 120 s timeout. It reads every result set so a late error still fails
the request, then commits (not cancellable at that point). On any error it
rolls back if SQL Server has not already done so (the procedure uses
`XACT_ABORT ON`), logs and rethrows.

`Sql/insertAcQuireOfflineBek.sql` creates the procedure and grants `EXECUTE`
to `userAcquire`. It copies the `Raw core import_JSON` branch of
`dbo.InsertUpdateCoreDescr_WellCAD` with the same parameters, except that it
stores `@usr` as sent and falls back to `SUSER_SNAME()` only when `@usr` is
empty. The old procedure is unchanged and WellCAD still uses it.

### What gets stored

The procedure writes `HOLEID` (from `drillhole`), `PROJECTCODE` (from
`project`), `[FROM]` and `[TO]` (rounded to two decimals), `PRIORITY` (always
1), `NAME`, `VALUE`, `COMMENT_VALUE` and `usr` in `MyApps.CoreDescrData`, one
row per interval and attribute. `NAME` is the reverse of the Data Viewer
mapping above; comments go to `COMMENT_VALUE`. Everything else in the file
(`campaign`, timestamps, `created_by`, `edited_by`, row fields such as `id`,
`corePass`, `omFacies` and `py`) is accepted but filtered out.

Existing rows are matched on `HOLEID`, `PROJECTCODE`, `FROM`, `TO`,
`PRIORITY`, `NAME` and `usr`, so uploading the same file again updates them.
Because `usr` is part of the key, the same file from another user adds a
second set of rows, and rows stored earlier under `userAcquire` are not
updated by a re-upload. The API never deletes rows and does not report counts.

### Uploader identity

`@usr` is always the Windows user Negotiate verified, as the full
`DOMAIN\user`. `created_by`, `edited_by` and form fields are never used for
it, and `expectedUser` is only compared. Unless
`Database:ImpersonateWindowsUser` is on, the connection stays `userAcquire`
and SQL Server trusts the API to pass the verified name.

If the procedure raises error 51001, the API rolls back and answers `403`.
`dbo.insertAcQuireOfflineBek` does not raise 51001 today.
`Sql/UploadDataUserAuthorization.sql` describes an AD group check that would,
but it and the other `Sql/UploadDataUsr*.sql` scripts were written for
`dbo.InsertUpdateCoreDescr_WellCAD`.

### Responses

Every body is `{ "success", "message" }`, plus `errors` for invalid data and
`drillhole`, `project`, `totalRows` (JSON rows received) on success. A 401
has no body.

| Status | `message` |
| --- | --- |
| 200 | `Data uploaded successfully.` |
| 400 | `No file was uploaded.`, `Only .json files are accepted.`, `File name must be 50 characters or fewer.`, `Windows user name must be 50 characters or fewer.`, `Invalid JSON file.`, `Invalid lithology data.` |
| 403 | `BDOM\jsmith has no database permission to upload data. Contact the database administrator.` (permission error) or `BDOM\jsmith is not authorized to upload data. Contact the database administrator.` (error 51001) |
| 409 | `You are signed in as BDOM\jsmith, but this page shows BDOM\other. Reload the page and upload again.` |
| 413 | `File exceeds the 10 MB limit.` |
| 500 | `Database upload failed.` |

### Error 229 (INSERT permission denied)

```text
The INSERT permission was denied on the object 'CoreDescrData',
database 'ACQMN01', schema 'MyApps'.   (Number 229, State 5, Class 14)
```

The API answers with the 403 "no database permission" message and logs the
SQL error, never credentials or the JSON. The error names the table, so
`EXECUTE` was allowed; the ownership chain from the procedure to
`MyApps.CoreDescrData` is broken (different owner, dynamic SQL or a
cross-database write) or the login has a `DENY`. `Sql/UploadDataPermissions.sql`
(written against the old procedure name) has diagnostics and commented-out
fixes. The recommended fix is to sign the procedure with a certificate whose
user holds `SELECT, INSERT, UPDATE` on that table, so the login keeps
`EXECUTE` only. Avoid `db_owner`, `db_datawriter`, schema-wide grants,
cross-database chaining, `TRUSTWORTHY` and `EXECUTE AS OWNER`.

### Known limitations

`OPENJSON` reads `PROJECTCODE` as `varchar(10)`, attribute values as
`varchar(20)` and comments as `varchar(254)`, while the API checks only the
parameter sizes, so longer values may be cut by SQL Server. `FileName` and
`PathName` are not stored. No counts come back; Section G of
`SQLTests/Test_UploadData_StoredProcedure.sql` shows the stored rows.

## Tests

`../BackendApi.Tests` (xUnit) runs the real ASP.NET Core pipeline with fake
repositories and never connects to a database. It covers the exact route list
(`ApiRoutesTests`), the production connection settings and password-free
logging (`ConnectionConfigurationTests`), the `EXECUTE AS LOGIN` batch and
fallback auth policy (`WindowsUserImpersonationTests`), AD group access
(`Auth/`), the status check (`Status/`), lookup grouping (`TableConstants/`),
interval building and Campaign matching (`DataViewer/`), and upload
validation, filtering, SQL errors 229 and 51001, anonymous uploads and the
`@usr` value (`UploadData/`).

For a manual check against an approved development database, upload a valid
export in Swagger (expect `200` and `totalRows` equal to the file's rows),
upload it again (the row count for that `HOLEID` stays the same), then open
`GET /api/dataviewer?drillhole=<HOLEID>`.
