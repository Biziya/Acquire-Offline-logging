# Services

The non-React layer: HTTP clients, IndexedDB access, lookup configuration and
the signed-in user. Nothing here imports React or holds UI state.

```text
services/
├── Api/
│   ├── apiConfig.ts         buildApiUrl, the only place an API URL is built
│   ├── backendStatus.ts     GET /api/status
│   ├── drillholeApi.ts      GET /api/drillholes
│   ├── rawLithoApi.ts       GET /api/table-constants (all nine lookups)
│   ├── dataViewerApi.ts     GET /api/dataviewer/drillholes and /api/dataviewer?drillhole=…
│   └── uploadData.ts        POST /api/upload-data
├── IndexDB/
│   ├── rawLithoDatabase.ts       owns raw-litho-db: version, stores, transactions
│   ├── rawLithoDraftDb.ts        Raw Litho drafts and the active session
│   ├── rawLithoSaveQueue.ts      pending snapshots and ordered draft writes
│   ├── drillholeCacheDb.ts       cached drillhole list
│   ├── recentDrillholesDb.ts     recently selected drillholes
│   ├── windowsIdentityDb.ts      last verified Windows user, for display
│   ├── rawLithoLookupCacheDb.ts  lookup cache, in its own database
│   └── uploadDataDraftDb.ts      Upload Data working document, in its own database
├── rawLithoLookupConfig.ts  every Raw Litho dropdown
├── currentUser.ts           verified Windows user from the backend
└── websiteAccess.ts         whether that user may use the site
```

## Api/

`buildApiUrl(path)` returns a relative `/api/...` URL in development, so the
Vite proxy handles it and CORS never comes up. In production it prefixes
`VITE_API_BASE_URL` with trailing slashes removed. Every client goes through it,
and every client except `backendStatus.ts` sends `credentials: "include"` so the
backend sees the Windows user.

- `getBackendStatus(signal)` succeeds only on HTTP OK with
  `{ "status": "online" }`. Anything else throws, and the status indicator
  shows Offline.
- `getDrillholes(signal)` returns `{ holeId, projectCode, campaign }` records
  and rejects the whole response if any record is invalid, so the caller falls
  back to the cache.
- `getRawLithoLookup(fieldKey)` returns one lookup list. All nine lists come
  from a single `GET /api/table-constants` request that is shared for the page
  load. The lookup's `responseKey` picks its list. A failed request, or a list
  that fails validation, is forgotten so the next call asks again. One bad list
  fails only its own lookup.
- `getDataViewerDrillholes(signal)` and `getDataViewerRecords(drillhole, signal)`
  feed the Database Viewer and validate the response shape.
- `importUploadData(file, expectedUser, signal)` posts `multipart/form-data`
  with `file` and `expectedUser`. The backend takes the uploader (`usr`) from
  Windows authentication and only compares `expectedUser` with it, refusing with
  `409` when they differ. The request times out after 180 seconds. A `401`
  becomes "Couldn't confirm your Windows sign-in.", a network failure "Server
  unavailable", and other errors show the JSON `message`, `detail` or `title`
  plus the first row error. A non-JSON error body is never shown.

## IndexDB/

### `rawLithoDatabase.ts`

The single owner of the `raw-litho-db` connection (version 4) and its stores:
`drafts`, `drillholeCache`, `rawLithoLookupCache` and `session`. Other modules
use its helpers (`readValue`, `readEntries`, `writeValue`, `deleteValue`, all
built on `runTransaction`) instead of opening the database. An upgrade only
creates missing stores. The connection closes after each transaction and on
`versionchange`, a blocked upgrade rejects, and writes resolve when the
transaction completes. The `rawLithoLookupCache` store is declared but unused.

### `rawLithoDraftDb.ts`

| Function | Purpose |
| --- | --- |
| `buildRawLithoDraftKey(drillhole)` | Trimmed drillhole id, or `null` when blank (the page stays disabled) |
| `readRawLithoDraft(key)` | One draft, unwrapping older `{ document }`, `{ snapshot }`, `{ draft }` and `{ value }` envelopes |
| `readRawLithoDrafts()` | Every stored draft as `{ draftKey, draft }`, for the recent working drillholes |
| `writeRawLithoDraft(key, lithoDocument)` | Replaces a draft |
| `readRawLithoSession()` / `writeRawLithoSession({ drillhole, page })` | Active drillhole and table page. Writing a blank drillhole deletes the record. |

### `rawLithoSaveQueue.ts`

`DraftSaveQueue` (exported instance `rawLithoSaveQueue`) keeps the latest
pending snapshot per drillhole and writes them one at a time per key. A
snapshot is dropped only after its write commits, and a revision check stops an
older write from removing a newer edit. Failed snapshots stay queued across
route remounts. `commitImport` writes a confirmed JSON import once, after
earlier edits have saved. Imports are never retried in the background. The
persistence hook (`useRawLithoDraftPersistence`) decides when to flush.

### Caches and small stores

- `drillholeCacheDb.ts`: `saveDrillholes` and `readDrillholeCache` validate and
  strip records to `{ holeId, projectCode, campaign }` on write and read. A
  damaged cache reads as `null`.
- `recentDrillholesDb.ts`: `readRecentDrillholes` and `writeRecentDrillholes`
  store `{ holeIds, updatedAt }` under `session["recent-drillholes"]`, most
  recent first, without blanks or duplicates. How many to keep is decided in
  `pages/RawLitho/drillholeOrdering.ts`.
- `windowsIdentityDb.ts`: `readCachedWindowsIdentity` and
  `cacheVerifiedWindowsIdentity` keep
  `{ id: "current-user", domain, username, fullUsername, lastUpdated }` under
  `session["windows-identity"]`. It is for display only and never used to
  stamp edits or authorize anything.
- `rawLithoLookupCacheDb.ts`: `readLookupCache` and `saveLookupCache` use a
  separate database, `raw-litho-lookup-cache-db` (store `lookups`, key path
  `cacheKey`).
- `uploadDataDraftDb.ts`: `readUploadDataDraft`, `writeUploadDataDraft` and
  `clearUploadDataDraft` keep one draft in `upload-data-db` (store `drafts`,
  key `"current"`): `{ fileName, fileSize, isEdited, document, savedAt }`. The
  document is stored as a structured clone. Writes and clears share one promise
  chain, so a Cancel during a save wins.

## rawLithoLookupConfig.ts

Defines every Raw Litho dropdown. The API client, the lookup hook, the row
renderer and validation all read it, so a new lookup needs only a new entry.

| Export | Contents |
| --- | --- |
| `RAW_LITHO_LOOKUPS` | The nine API lookups: `fieldKey`, `label`, `responseKey`, `codeProperty`, `cacheKey` |
| `RAW_LITHO_LOCAL_LOOKUPS` | Granulo and Hardness: local digits 0 to 9, `maxLength: 1` |
| `GRANULO_HARDNESS_OPTIONS` | `[{ code: "0" }, …, { code: "9" }]` |
| `RAW_LITHO_ALL_LOOKUPS` | Both lists, for validation |
| `RAW_LITHO_API_LOOKUP_BY_FIELD` | Field to API lookup, used by `rawLithoApi.ts` |
| `RAW_LITHO_LOOKUP_BY_FIELD` | Field to any lookup, used by `RawLithoRow.tsx` |

`responseKey` and the row field can differ: Colour arrives as `colourCode` and
is stored as `colorCode`.

## currentUser.ts and websiteAccess.ts

A browser cannot read the Windows login, so `getVerifiedWindowsIdentity()` asks
the backend with `GET /api/status?includeUser=true` and `credentials: "include"`.
That request needs Windows authentication (Kerberos or NTLM), and the answer
carries `userName`, `fullUsername` and `isAuthorized`. A missing
`isAuthorized` counts as allowed, since an older backend has no group check.
`getCurrentWindowsUser()` returns just the `userName`.

- Callers share one request. A verified identity is reused for one minute.
- A `401`, a bad body or a network error returns `null` and is not kept, so
  the next call tries again. `useCurrentUser()` retries every 10 seconds.
- Upload Data calls it with `forceRefresh` right before uploading.
- The name stamps `created_by` and `edited_by` and fills Upload Data's
  "Imported By". Nothing else (host name, user agent, typed input) is ever used.

`checkWebsiteAccess()` turns that answer into `allowed`, `denied` or
`unverified`. It saves the last backend answer under `session["website-access"]`
and uses it while the backend is unreachable. `hooks/useAccessCheck.ts` calls
it. The backend enforces access on its own; this only decides what the site
shows.

Edge and Chrome send Windows credentials to `localhost` automatically. Another
host name must be in the Local intranet zone (or an `AuthServerAllowlist`
policy), or the browser prompts for a login.

## Caching

Lookups and the drillhole list are network-first: cached records show
immediately, the fetch replaces them and refreshes the cache, and a failed fetch
keeps the cached copy. Raw Litho rows never go to the backend. They are written
to `raw-litho-db` and leave the browser only as an exported JSON file.
