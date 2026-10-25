# Services

Non-React layer: HTTP clients, IndexedDB access, and lookup configuration.
Nothing here imports React, and nothing here holds UI state.

```text
services/
├── Api/
│   ├── apiConfig.ts              buildApiUrl — the only place a URL is built
│   ├── backendStatus.ts          GET /api/status
│   ├── dataViewerApi.ts          GET /api/dataviewer?drillhole=… (Database Viewer)
│   ├── drillholeApi.ts           GET /api/drillholes
│   ├── rawLithoApi.ts            GET /api/table-constants (all 9 lookups)
│   └── uploadData.ts             POST /api/upload-data
├── IndexDB/
│   ├── rawLithoDatabase.ts       owns raw-litho-db: version, stores, transactions
│   ├── rawLithoSaveQueue.ts      pending snapshots, serialized saves and retries
│   ├── rawLithoDraftDb.ts        drafts + session stores
│   ├── drillholeCacheDb.ts       drillholeCache store
│   ├── recentDrillholesDb.ts     recently selected drillholes (session store)
│   ├── rawLithoLookupCacheDb.ts  separate raw-litho-lookup-cache-db
│   ├── rawExtractionDraftDb.ts   raw-extraction-db (unrouted page)
│   └── uploadDataDraftDb.ts      separate upload-data-db (Upload Data draft)
├── rawLithoLookupConfig.ts       single source of truth for all 11 lookups
└── README.md
```

## Api/

### `apiConfig.ts`

```js
const apiBaseUrl = import.meta.env.DEV ? "" : configuredBaseUrl;
export function buildApiUrl(path) { ... }
```

Dev mode always produces relative `/api/...` URLs so the Vite proxy handles the
request and no CORS negotiation is needed. Production uses
`VITE_API_BASE_URL` with trailing slashes stripped. Every client goes through
`buildApiUrl`.

### `drillholeApi.ts`

`getDrillholes(signal)` → array of `{ holeId, projectCode, campaign }`.

Rejects the entire response if it is not an array, if any record is missing
those three string fields, if a `holeId` is blank, or if `holeId` values are not
unique. Better to fall back to the cache than to render a half-valid list.

### `rawLithoApi.ts`

`getRawLithoLookup(fieldKey)` → array of records for one lookup.

- All nine lists come from **one** request, `GET /api/table-constants`
  (`{ caCode: [...], colourCode: [...], ... }`); the lookup's `responseKey`
  picks its list. An unknown field rejects immediately.
- **Shared in flight**: the one request is cached at module level, so all
  nine lookups on every page cost a single call per page load.
- A failed request, or a list that fails validation, is forgotten, so a
  retry asks the server again.
- Throws unless that list is an array of objects with a string value for the
  configured code property; one bad list fails only its own lookup.

### `backendStatus.ts`

`getBackendStatus(signal)` requires HTTP OK **and** `{ "status": "online" }`.
Anything else throws, which the indicator treats as offline.

### `uploadData.ts`

`importUploadData(file, signal)` POSTs `multipart/form-data` with the file under
the field name `file`. Network failures become
"Server unavailable"; `AbortError` is re-thrown
untouched. Error text is read from `detail`, `message`, or `title`, or from a
plain-text body, falling back to "Upload failed".

## IndexDB/

### `rawLithoDatabase.ts` — the gateway

The single owner of the `raw-litho-db` connection, its version (**4**), and its
store list. Every other module in this folder calls its helpers rather than
opening the database itself, so the schema is declared exactly once.

```text
readValue(store, key)          → runTransaction("readonly")
writeValue(store, key, value)  → runTransaction("readwrite")
deleteValue(store, key)        → runTransaction("readwrite")
```

Stores: `drafts`, `drillholeCache`, `rawLithoLookupCache`, `session`. Upgrades
create only the missing stores, so adding one is a version bump plus a name.
The connection closes after each transaction and on `versionchange`, and a
blocked upgrade rejects rather than hanging.

### `rawLithoDraftDb.ts`

| Function | Purpose |
| --- | --- |
| `buildRawLithoDraftKey(drillhole)` | Trims the id, returns `null` when blank — the "page disabled" signal |
| `readRawLithoDraft(key)` | Reads a draft, unwrapping older `{ document }`, `{ snapshot }`, `{ draft }`, `{ value }` envelopes |
| `writeRawLithoDraft(key, lithoDocument)` | Replaces the draft; rejects without a key |
| `deleteRawLithoDraft(key)` / `hasRawLithoDraft(key)` | Delete / existence check |
| `readRawLithoSession()` / `writeRawLithoSession({ drillhole, page })` | The active drillhole and table page; writing a blank drillhole deletes the record |

### `drillholeCacheDb.ts`

Validates and strips records to `{ holeId, projectCode, campaign }` on both
write and read, so a corrupted cache returns `null` instead of bad data.

### `recentDrillholesDb.ts`

`readRecentDrillholes()` / `writeRecentDrillholes(holeIds)`, stored under
`"recent-drillholes"` in the existing `session` store as
`{ holeIds, updatedAt }` — most recent first. Blank and duplicate ids are
dropped on both write and read. Storage only: how many are kept and where they
appear in the list belongs to `pages/RawLitho/drillholeOrdering.ts`.

### `rawLithoLookupCacheDb.ts`

A **separate** database (`raw-litho-lookup-cache-db` v1, store `lookups`,
`keyPath: "cacheKey"`) holding `{ cacheKey, records, updatedAt }` per lookup.
Note that `raw-litho-db` also declares an unused `rawLithoLookupCache` store.

### `rawExtractionDraftDb.ts`

Serves the unrouted `RawExtraction.tsx`. Own database, single `"current"` key,
and a promise chain that serialises writes.

### `uploadDataDraftDb.ts`

Upload Data's working document. Its own database (`upload-data-db`, store
`drafts`, single `"current"` key) so it never touches the Raw Litho schema.
The value is `{ fileName, fileSize, isEdited, document, savedAt }`; the parsed
document is stored as-is (structured clone), never re-serialised to JSON.
`writeUploadDataDraft` and `clearUploadDataDraft` share one promise chain, so a
Cancel issued during a save always wins; `readUploadDataDraft` waits for that
chain first.

## rawLithoLookupConfig.ts

One place defining every dropdown, consumed by the API client, the loading hook,
the row renderer, and validation.

| Export | Contents |
| --- | --- |
| `RAW_LITHO_LOOKUPS` | The 9 API lookups: `fieldKey`, `label`, `responseKey` (list key in `/api/table-constants`), `codeProperty`, `cacheKey` |
| `RAW_LITHO_LOCAL_LOOKUPS` | Granulo and Hardness: `source: "local"`, digits 0–9, `maxLength: 1`, numeric input guard |
| `GRANULO_HARDNESS_OPTIONS` | `[{ code: "0" }, … { code: "9" }]` |
| `RAW_LITHO_ALL_LOOKUPS` | Both lists, used by lookup validation |
| `RAW_LITHO_API_LOOKUP_BY_FIELD` | Field → API lookup, used by `rawLithoApi.ts` |
| `RAW_LITHO_LOOKUP_BY_FIELD` | Field → any lookup, used by `RawLithoRow.tsx` |

`codeProperty` matters: the API property and the row field are not always the
same name. Colour is served as `colourCode` but stored as `colorCode`.

Adding a lookup means adding one entry here — the client, cache, dropdown, and
validation all pick it up.

## currentUser.ts

`getCurrentWindowsUser()` is the one place the app asks who is signed in
(`Bek` for a local account, `COMPANY\bek` for a domain account). Through
`hooks/useCurrentUser.ts` it feeds the sidebar user name, Raw Litho's
`created_by` / `edited_by`, and Upload Data's "Edited By" stamp and
"Imported By".

**How the name is obtained.** A browser cannot read the Windows login, so
`getCurrentWindowsUser()` asks the backend: `GET /api/whoami`
with `credentials: "include"`. That route requires
Windows Integrated Authentication (Negotiate: Kerberos or NTLM), so the
browser proves the signed-in Windows user and the backend answers with
`userName` (backend README, *Identity*). The plain status poll stays anonymous.

A verified name is kept for the rest of the page load. An error status (401
when the browser sent no Windows credentials), a body without `userName` or
a network failure gives `null`, shown as "User not identified", and is not
kept: `useCurrentUser()` asks again every 10 seconds until a name arrives,
so starting the backend after the page fills in the name without a refresh.
The hostname, user agent, a build-time user name, browser fingerprinting or
anything typed in are never used.

**Browser and deployment notes**
- Edge and Chrome send Windows credentials to `localhost` automatically. A
  backend on another host name must be in the browser's Local intranet zone
  (or an `AuthServerAllowlist` policy), otherwise the browser asks for a login.
- `npm run dev`: Vite proxies `/api/status` over a single kept-alive
  connection (`vite.config.ts`), because NTLM authenticates a connection, not
  a request. Dev-only; fine on a single-user PC.
- Production should serve the frontend and `/api` from one origin
  (`VITE_API_BASE_URL` empty). A cross-origin API would need its CORS policy
  changed from `AllowAnyOrigin` to named origins with `AllowCredentials`.

## Caching strategy

Reads are network-first with a cache fallback; the working table is local-only.

```text
GET lookups / drillholes
  show cached records immediately (if any)
  fetch
    ok   → replace state, refresh the cache
    fail → keep the cached records, or surface an offline message

Raw Litho rows
  never sent to the backend
  debounced write to raw-litho-db, exported as JSON on Save
```

## Draft write coordination

`rawLithoSaveQueue.ts` retains the latest pending snapshot for each drillhole.
It serializes writes per key, removes a pending snapshot only after its write
commits, and drains edits received during an in-flight write. Failed snapshots
remain available across route remounts. The persistence hook schedules debounce,
retry, online, visibility, and unmount flushes. Manual saves and deletion stage
snapshots; confirmed imports use `commitImport` as an ordered one-shot write.
Earlier edits must save first, and imports are never retained for background
retry or restoration. A failed import requires an explicit user retry. Cancelling
before write submission leaves earlier and newer edit snapshots intact. Once
submitted, an import can commit and is not reported as cancelled. The snapshot
identity check ensures an older successful write cannot remove a newer edit. `rawLithoDatabase.ts` additionally orders all writes
and resolves them on transaction completion, not request success.
