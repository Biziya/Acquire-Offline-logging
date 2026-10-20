# TypeScript frontend

Complete migration of the supplied React/Vite frontend. Backend code, API routes,
JSON field names, IndexedDB database names/versions and UI styling are unchanged.
All 55 supplied JavaScript/JSX files are now TypeScript/TSX, including the unrouted
Raw Extraction page and the existing empty future-page placeholders.

## Run locally

Use Node.js 24 LTS (tested with 24.19.0), or a version supported by `package.json`.
From this folder:

```bash
npm ci
npm run dev
```

The existing frontend uses HashRouter: `/#/raw-litho` and `/#/upload-data`.
The new Vite configuration proxies `/api` to `http://localhost:7047` in development.
Copy `.env.example` to `.env.local` and set `VITE_API_PROXY_TARGET` if your existing
backend uses another address. No backend modification is needed.

For production, `VITE_API_BASE_URL` may be empty for same-origin `/api` requests,
or the existing backend origin. Build with `npm run build`; deploy the `dist/`
contents with your existing hosting setup.

Only `src/` and `package.json` were supplied. This bundle adds `index.html`, Vite,
TypeScript, ESLint and test configuration, and a lockfile. When applying it to a
full repository, keep your existing environment values, `public/` assets and IIS
configuration, and merge any custom root configuration with the included defaults.

## Structure

| File | Responsibility |
| --- | --- |
| `src/types/rawLithoSchema.ts` | Complete persisted field contract, keyed column definitions and generated defaults; visible ordering stays in `constants.ts` |
| `src/types/domain.ts` | Rows, documents, drillholes, lookups, props-related contracts, sessions, imports and operation results |
| `src/types/validation.ts` | Runtime guards for external data and error handling |
| `src/pages/RawLitho/hooks/useRawLithoWorkspace.ts` | Single working document, selected drillhole, pagination, operations and UI feedback |
| `src/pages/RawLitho/hooks/useRawLithoDraftPersistence.ts` | Session/draft restoration, debounce, retries, readiness and lifecycle flushing |
| `src/pages/RawLitho/rawLithoDocumentOperations.ts` | Storage-free create/edit/add/delete/commit/sort transformations |
| `src/services/IndexDB/rawLithoSaveQueue.ts` | Latest pending snapshot per drillhole and serialized writes |
| `src/pages/RawLitho/rawLithoHelpers.ts` | Document normalization, JSON import validation and export |
| `tests/` | Persistence, operations, storage/API and keyboard regression tests |

The workspace has one editable document. A synchronous ref points to the same
working value so an edit and drillhole switch in one React batch cannot lose the
edit. Pending queue snapshots exist only for persistence/recovery. Failed writes
retain the latest snapshot; failed loads keep editing disabled without creating
or saving a blank replacement. Load/save retries run every two seconds while the
workspace is mounted. Save, deletion and confirmed imports share write ordering. Imports use a one-shot
write after earlier edits have saved; they never enter the autosave snapshot map.
Failed imports require explicit confirmation to retry. A pending import is prepared
and awaiting confirmation. Cancellation is allowed before its replacement write
starts; a submitted write may commit even after navigation, but stale completions
cannot select an old drillhole or report success in a new context.

The migration also fixes the Raw Extraction storage import/export filename and
preserves string row IDs during focus restoration. API/JSON/IndexedDB values are
checked at runtime; TypeScript does not replace those checks. No explicit `any`,
unsafe type assertions or TypeScript suppression directives were added.

## Checks

```bash
npm run typecheck  # strict + noUncheckedIndexedAccess, including tests and build configuration
npm run lint      # ESLint + React hook rules
npm test          # regression suite
npm run build     # type checking followed by Vite production build
npm run check     # all the above
```

Automated verification: strict type checking with `noUncheckedIndexedAccess`,
ESLint, 52 regression tests and the production build all pass. CSS, assets and sample JSON files are byte-identical to the upload.

Tests cover immediate drillhole switching, read/write failures and retries,
stale load responses, route unmount flushing, legacy draft/session restoration,
row operations and validation, depth sorting, recent drillhole ordering,
autocomplete acceptance, keyboard focus, F4/F5, dropdown ArrowDown row creation,
delete confirmation, IndexedDB wrappers/caches, import and API response validation.
Additional review regressions cover schema compilation failures, empty rows,
newer snapshots surviving older saves, import failures and explicit retries,
cancellation before and after write submission, stale asynchronous completions,
and preservation of earlier and newer edits.

The existing ES2022, DOM and DOM.Iterable libraries already support `Error.cause`.
Vite client and Node types were retained along with the test configuration.
See [TypeScript conventions](src/README.md#typescript-conventions) for type and
runtime-validation ownership.

## Verification limits

- Manual browser, backend and deployment verification was not performed.
- Tests use jsdom and fake IndexedDB; live backend, actual-browser IndexedDB,
  visual browser rendering and IIS deployment were not available for verification.
- Pagehide flushing is best effort. Pending edits survive route remounts in the
  running application, but cannot survive a browser crash or forced termination
  if storage writes have not succeeded.
- Write ordering is coordinated within one application instance. Simultaneous
  editing of the same drillhole in multiple browser tabs is not conflict-resolved.
- Newest drillhole ordering still reverses API order because the existing
  response contains no timestamp field.
