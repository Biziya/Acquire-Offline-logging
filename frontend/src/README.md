# Frontend source

React + Vite single-page application. This file maps the `src/` tree; the
[root README](../README.md) covers architecture, setup, and the API contract.

## Folder tree

```text
src/
├── assets/          images (badrakh-logo.png, hero.png, react.svg, vite.svg) — unreferenced
├── components/      shared UI
│   ├── Sidebar.tsx
│   ├── StatusIndicator.tsx
│   └── StatusIndicator.css
├── contexts/        empty
├── css/             global and legacy stylesheets
├── other/           sample JSON documents, not imported by any code
├── pages/
│   ├── RawLitho/    main feature (own README)
│   ├── UploadData/  JSON upload (own README)
│   ├── future_pages/  11 empty placeholder files
│   ├── Home.tsx
│   └── RawExtraction.tsx   earlier page, no route
├── types/           shared domain types and runtime guards
├── services/        API clients, IndexedDB, lookup config (own README)
├── App.tsx          layout + routes
├── main.tsx         entry point
└── README.md        this file
```

## Folder responsibilities

| Folder | Purpose |
| --- | --- |
| `assets` | Static images. Nothing imports them today. |
| `components` | Components used by the app shell or more than one page. |
| `contexts` | Empty. No React context is used anywhere. |
| `css` | Global styles (`index.css`), app-shell layout (`App.css`), and stylesheets for pages that keep CSS outside their folder. |
| `other` | Example exports and fixtures kept for reference. |
| `pages` | One folder per substantial page, holding its components, hooks, CSS and README. Small pages are a single file. |
| `services` | Everything non-React: `fetch` clients, IndexedDB access, lookup configuration. |

## Application shell

`main.tsx` mounts `<App />` inside `StrictMode` and `HashRouter`, and imports
`css/index.css`.

`App.tsx` renders the persistent layout — `Sidebar`, the status bar, and
`Routes` — so the sidebar stays mounted while the route changes.

```text
App
├── Sidebar                collapsible, NavLink-based, owns its collapsed state
└── main.page-content
    ├── StatusIndicator    polls GET /api/status every 5s (900ms timeout)
    └── Routes
        ├── /              Home
        ├── /raw-litho     RawLitho
        └── /upload-data   UploadData
```

`StrictMode` double-invokes effects in development. Data-loading hooks are
written for it: `useDrillholes` and `useRawLithoLookups` use `AbortController`,
and the draft loader in `useRawLithoDraftPersistence` ignores stale load results.

## Pages

| Route | Component | Notes |
| --- | --- | --- |
| `/` | `pages/Home.tsx` | Placeholder heading. The file carries a TODO asking for requirements. |
| `/raw-litho` | `pages/RawLitho/RawLitho.tsx` | The main feature. [README](pages/RawLitho/README.md) |
| `/upload-data` | `pages/UploadData/UploadData.tsx` | [README](pages/UploadData/README.md) |

Not routed: `pages/RawExtraction.tsx` (complete but removed from `App.tsx`) and
the 11 empty files in `pages/future_pages/`.

## Stylesheets

| File | Used by |
| --- | --- |
| `css/index.css` | global, imported by `main.tsx` |
| `css/App.css` | app shell, imported by `App.tsx` |
| `css/Home.css` | `Home.tsx` |
| `css/Sidebar.css` | `Sidebar.tsx` |
| `css/RawExtraction.css` | `RawExtraction.tsx` (unrouted) |
| `css/RawLitho.css` | **nothing** — superseded by `pages/RawLitho/RawLitho.css` |
| `components/StatusIndicator.css` | `StatusIndicator.tsx` |
| `pages/RawLitho/RawLitho.css`, `Toast.css` | the Raw Litho page |
| `pages/UploadData/UploadData.css` | the Upload Data page |

Newer pages keep their CSS beside the component; `css/` holds global styles and
the older page stylesheets.

## Conventions

- Components and pages: `PascalCase` files and functions.
- Hooks: `useCamelCase`, one concern each, in the page's `hooks/` folder.
- Services and utilities: `camelCase`. No React imports in `services/`.
- Fixed values: `UPPER_SNAKE_CASE` (`RAW_LITHO_ROWS_PER_PAGE`).
- CSS classes: `kebab-case` with a page prefix (`raw-litho-`, `upload-data-`),
  and `--modifier` suffixes (`raw-litho-cell--missing`).
- Guard clauses and early returns over nested conditionals; event handlers stay
  one or two levels deep by delegating to small helpers.
- Pure logic (validation, normalisation) lives in its own module, separate from
  the components and from user-facing text.

## TypeScript conventions

- Shared domain contracts belong in `src/types/domain.ts`. The persisted Raw Litho
  field union, `ColumnDefinition`, complete keyed schema and row defaults belong
  together in `src/types/rawLithoSchema.ts`. Add new fields there; every field needs
  a matching definition and default. Keep visible ordering in `constants.ts` so
  hiding a column does not remove an exported field.
- Shared runtime guards belong in `src/types/validation.ts`. Feature-specific JSON
  normalization and import validation belong in `rawLithoHelpers.ts`; stored
  recent-hole parsing belongs at its IndexedDB boundary. Keep row business rules
  in `rawLithoValidation.ts` and pure transformations in
  `rawLithoDocumentOperations.ts`.
- Accept `unknown` at API, JSON and storage boundaries, validate and normalize it,
  then pass domain types internally. TypeScript types disappear at runtime and
  cannot protect against malformed responses, old drafts or edited JSON files.
- Put imports first, then types/interfaces, then implementation. Use `import type`
  when an import is needed only for a type, keeping runtime dependencies explicit.
- Keep strict checking and `noUncheckedIndexedAccess` enabled. Handle missing array
  entries and lookup results explicitly. Do not use `any`, unsafe assertions,
  non-null assertions, `@ts-ignore` or `@ts-expect-error` to bypass findings.
- Name application documents `lithoDocument` or `draft`; reserve `document` for the
  browser global. Persisted properties such as `{ document: ... }` remain unchanged.

Run from the project root:

```bash
npm run typecheck  # source, tests and configuration
npm run lint
npm test
npm run build     # type checking is required before Vite builds
npm run check     # all checks
```

## Adding a page

1. Create `src/pages/YourPage/YourPage.tsx` (or a single file for a small page).
2. Keep its CSS beside it as `YourPage.css` and import it from the component.
3. Add a `Route` in `App.tsx`.
4. Add a `NavLink` and an icon in `components/Sidebar.tsx`.
5. Put data access in `src/services/Api/` and any local persistence in
   `src/services/IndexDB/` — do not `fetch` from a component.
6. Add `src/pages/YourPage/README.md` covering purpose, components, hooks,
   endpoints, state, handlers and validation.
7. Update the folder trees in this file and the root README.

## Build

```bash
npm run build -- --outDir publish
```
