# AcQuire WEB

AcQuire WEB is an offline-first web app for logging drillhole lithology. Geologists
enter intervals in the browser, keep working without a network connection, and
upload the finished data to SQL Server later.

## Pages

- Raw Litho: data entry for one drillhole at a time. Rows are saved in the
  browser's IndexedDB as you type, and the document can be exported to and
  imported from a JSON file.
- Upload Data: open an exported JSON file, check and fix it, then upload it to
  SQL Server.
- Database Viewer: a read-only view of the records already stored for a
  drillhole.

Each page has its own README:
[Raw Litho](frontend/src/pages/RawLitho/README.md),
[Upload Data](frontend/src/pages/UploadData/README.md),
[Database Viewer](frontend/src/pages/DatabaseViewer/README.md).

## Repository layout

| Folder | Contents |
| --- | --- |
| `frontend/` | React, TypeScript, Vite and Tailwind CSS 4 single-page app. See [frontend/README.md](frontend/README.md). |
| `backend/BackendApi/` | ASP.NET Core Web API on .NET 10, reading and writing SQL Server, with Windows authentication. See [backend/BackendApi/README.md](backend/BackendApi/README.md). |
| `backend/BackendApi.Tests/` | xUnit tests for the API. They use fake repositories and never touch a real database. |

## Running locally

Start the backend first. From `backend/BackendApi`:

```bash
dotnet restore
dotnet run --launch-profile http
```

It listens on `http://localhost:7047`, with Swagger at `/swagger` in
Development. You need the .NET 10 SDK and access to the configured SQL Server
database.

Then start the frontend. From `frontend` (Node.js 22.13+, 24, or 26+):

```bash
npm ci
npm run dev
```

The Vite dev server proxies `/api` to `http://localhost:7047`. Set
`VITE_API_PROXY_TARGET` in `frontend/.env.local` if the backend runs somewhere
else.

Tests:

```bash
cd frontend && npm test
cd backend/BackendApi && dotnet test ../BackendApi.Tests
```

## Website access

Only members of one Active Directory group can use the website. The group is
set on the server in `Auth:AllowedGroup` (for example in
`appsettings.Production.json` or as the `Auth__AllowedGroup` environment
variable in IIS). Users outside the group get an Access denied page, and the
API answers their requests with `403`. Leaving the setting blank turns the
check off. Details are in
[Website access by AD group](backend/BackendApi/README.md#website-access-by-ad-group-authallowedgroup).
