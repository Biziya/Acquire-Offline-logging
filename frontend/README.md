# Frontend

The AcQuire WEB browser app: React 19, TypeScript, Vite and Tailwind CSS 4. It
uses `HashRouter`, so the pages live at `/#/raw-litho`, `/#/upload-data` and
`/#/database-viewer`. Any other address opens Raw Litho.

For a map of the source tree and the coding conventions, see
[src/README.md](src/README.md).

## Setup

Use a Node.js version allowed by `package.json` (`^22.13.0 || ^24.0.0 || >=26.0.0`).
From this folder:

```bash
npm ci
npm run dev
```

## API proxy and environment variables

In development, `buildApiUrl` (`src/services/Api/apiConfig.ts`) always produces
relative `/api/...` URLs, and `vite.config.ts` proxies `/api` to the backend.
The proxy keeps a single connection open to the backend because Windows
authentication (NTLM) authenticates a connection, not a single request.

Copy `.env.example` to `.env.local` to change the defaults:

| Variable | Used | Meaning |
| --- | --- | --- |
| `VITE_API_PROXY_TARGET` | `npm run dev` | Backend address for the dev proxy. Default `http://localhost:7047`. |
| `VITE_API_BASE_URL` | production build | Origin of the API. Leave it empty when the frontend and `/api` are served from the same origin. |

Serving both from one origin is the simplest setup. A cross-origin API would
need a CORS policy that allows credentials, since every request sends Windows
credentials.

## Scripts

```bash
npm run dev         # Vite dev server
npm run typecheck   # tsc --noEmit (strict, noUncheckedIndexedAccess)
npm test            # Vitest, once (jsdom + fake-indexeddb)
npm run test:watch  # Vitest in watch mode
npm run build       # typecheck, then vite build into dist/
npm run preview     # serve the production build locally
npm run check       # typecheck, lint, test and build
```

Lint the source and tests with:

```bash
npx eslint src tests
```

`npm run lint` (and therefore `npm run check`) runs `eslint .`, which also
lints the committed build output in `publish/` and reports errors there.

## Building for deployment

`npm run build` writes to `dist/`. The deployed copy is kept in `publish/`:

```bash
npm run build -- --outDir publish
```

The app version shown in the sidebar comes from `version` in `package.json`
(`appVersion.ts`, injected as `__APP_VERSION__`).

## Known limits

- Edits are flushed to IndexedDB on page hide on a best-effort basis. A browser
  crash before a write finishes can lose the last edits.
- Write ordering is coordinated inside one tab. Editing the same drillhole in
  two tabs at once is not reconciled.
