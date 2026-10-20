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
│   ├── Status/
│   └── UploadData/
│
├── Repositories/
│   ├── RawLithoPage/          # one folder per API, each with I<Name>Repository + <Name>Repository
│   └── UploadData/
│
├── Models/
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

## Build verification

```bash
dotnet build
```
