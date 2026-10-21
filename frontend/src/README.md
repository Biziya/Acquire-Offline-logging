# Frontend source

React + Vite single-page application. This file maps the `src/` tree; the
[root README](../README.md) covers architecture, setup, and the API contract.

## Folder tree

```text
src/
├── assets/          images (badrakh-logo.png, hero.png, react.svg, vite.svg) — unreferenced
├── components/      shared UI
│   ├── Sidebar.tsx         navigation; footer: domain user, divider, status
│   ├── StatusIndicator.tsx
│   ├── Toast.tsx           the one toast used by every page
│   ├── dataTableStyles.ts  table look + proportional widths, shared by all tables
│   └── fieldStyles.ts      labelled field / select / read-only value look
├── config/
│   ├── yamlConfig.ts  strict reader for the pages' config.yaml files
│   ├── ui.yaml        app-wide UI settings: toast durations per type
│   └── uiConfig.ts    typed, validated copy of ui.yaml
├── contexts/        empty
├── css/
│   ├── index.css    Tailwind entry, design tokens, base layer
│   └── RawExtraction.css  legacy CSS of the unrouted RawExtraction page
├── other/           sample JSON documents, not imported by any code
├── pages/
│   ├── RawLitho/    main feature (own README)
│   ├── DatabaseViewer/  read-only mock-data viewer (own README)
│   ├── UploadData/  JSON review, edit and upload (own README)
│   ├── future_pages/  11 empty placeholder files
│   ├── Home.tsx
│   └── RawExtraction.tsx   earlier page, no route
├── types/           shared domain types and runtime guards
├── hooks/
│   ├── useCurrentUser.ts  signed-in Windows user, or null (see services/currentUser.ts)
│   └── useToast.ts        one notification at a time (showToast / hideToast)
├── services/        API clients, IndexedDB, lookup config, current user (own README)
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
| `config` | `createConfigReader`, the shared, strict YAML reader. Each page owns its `config.yaml` + `config.ts`. |
| `css` | `index.css` (Tailwind entry and design tokens) and the legacy stylesheet of the unrouted Raw Extraction page. |
| `other` | Example exports and fixtures kept for reference. |
| `pages` | One folder per substantial page, holding its components, hooks, CSS and README. Small pages are a single file. |
| `services` | Everything non-React: `fetch` clients, IndexedDB access, lookup configuration. |

## Application shell

`main.tsx` mounts `<App />` inside `StrictMode` and `HashRouter`, and imports
`css/index.css`.

`App.tsx` renders the persistent layout — `Sidebar` and `Routes` — so the
sidebar stays mounted while the route changes.

```text
App
├── Sidebar                collapsible, NavLink-based, owns its collapsed state
│   ├── user name          footer; DOMAIN\username from useCurrentUser(), then a divider
│   └── StatusIndicator    footer; polls GET /api/status every 5s (900ms timeout)
└── main.page-content
    └── Routes
        ├── /              Home
        ├── /raw-litho     RawLitho
        └── /upload-data   UploadData
```

The sidebar footer shows, left-aligned, the signed-in Windows user
(`DOMAIN\username`, truncated with a tooltip when long), a thin divider, then
the backend status (green "Online", amber "Offline"). The user comes from
`useCurrentUser()`; with no trusted identity (today) it reads
"User not identified" — never a hostname or a guess. The sidebar is a flex column: the navigation
takes the free height and scrolls if it ever runs out of room, and the footer
never shrinks, so the indicator stays pinned without overlapping the links.
When the sidebar is collapsed only the coloured light is shown; its `title`
still reads "Backend online" / "Backend offline". There is exactly one
`StatusIndicator` in the app.

`StrictMode` double-invokes effects in development. Data-loading hooks are
written for it: `useDrillholes` and `useRawLithoLookups` use `AbortController`,
and the draft loader in `useRawLithoDraftPersistence` ignores stale load results.

## Pages

| Route | Component | Notes |
| --- | --- | --- |
| `/` | `pages/Home.tsx` | Placeholder heading. The file carries a TODO asking for requirements. |
| `/raw-litho` | `pages/RawLitho/RawLitho.tsx` | The main feature. [README](pages/RawLitho/README.md) |
| `/database-viewer` | `pages/DatabaseViewer/DatabaseViewer.tsx` | Read-only, **mock data only**. [README](pages/DatabaseViewer/README.md) |
| `/upload-data` | `pages/UploadData/UploadData.tsx` | [README](pages/UploadData/README.md) |

Not routed: `pages/RawExtraction.tsx` (complete but removed from `App.tsx`) and
the 11 empty files in `pages/future_pages/`.

## Styling (Tailwind CSS)

Styling is Tailwind CSS v4 through the `@tailwindcss/vite` plugin
(`vite.config.ts`). There is no `tailwind.config.js`: v4 is configured in CSS.

| File | Role |
| --- | --- |
| `css/index.css` | `@import "tailwindcss"`; the `@theme` design tokens; keyframes; a small base layer |
| `components/dataTableStyles.ts` | The data-table look (frame, header, cells, zebra rows) and `toPercentWidths`, used by Raw Litho, Upload Data and Database Viewer |
| `components/fieldStyles.ts` | Field label, text input / select and read-only value, used by Raw Litho and Database Viewer |
| `pages/RawLitho/rawLithoStyles.ts` | Class lists shared by several Raw Litho components |
| `pages/UploadData/uploadDataStyles.ts` | Class lists shared by the Upload Data sections |
| `css/RawExtraction.css` | Legacy, for the unrouted `RawExtraction.tsx` only |

- **Tokens.** The Raw Litho palette is declared once in `@theme` as
  `--color-rl-*`, which makes utilities such as `text-rl-navy`,
  `border-rl-grid` and `bg-rl-navy-soft`. All three pages use them, so they
  match. Change a colour there, not in components.
- **Utilities first.** Components write utilities inline. A class list used in
  more than one component goes in the page's `*Styles.ts` file as a plain
  string. Class names are always written in full, never assembled from pieces,
  so Tailwind can find them.
- **What stays as CSS.** Only what utilities cannot express cleanly: keyframes
  (dialog, backdrop, toast), number-input spinner removal, the
  `prefers-reduced-motion` override, and the page background.
- **Marker classes.** A few classes such as `raw-litho-cell--selected` and
  `upload-cell--error` carry no styling. They name a state for tests and
  debugging.
- **Configurable sizes.** Values that come from YAML, such as column widths and
  row heights, are applied as inline `style` values. Tailwind cannot generate
  classes for numbers known only at runtime.

### No horizontal page scrolling

The sidebar is fixed width and `main` takes the rest (`min-w-0 flex-1`). Pages
must fit that width:

- **Table widths are proportions.** YAML column widths are converted to
  percentages by `toPercentWidths`, so a table fills its container and keeps
  its column proportions at any width. A table's `minWidth` is only a
  readability floor (Raw Litho 760 px, Upload Data 680 px). Below it the table
  scrolls inside its own rounded frame, so nothing is clipped and the page
  itself never scrolls sideways. In practice that happens only on windows
  narrower than about 970 px with the sidebar expanded.
- **Grids and flex rows.** Grid tracks that hold wide content use
  `grid-cols-[minmax(0,1fr)]`. Flex rows of controls wrap (`flex-wrap`).
- **Fixed minimums can shrink.** Fixed minimum widths are written so they can
  shrink on tiny screens, for example `min-w-[min(190px,100%)]` or
  `w-[220px] max-w-full`.
- **Clipping is not a fix.** Never hide overflow with `overflow-x-hidden`.
  Correct the width instead.

## Configuration (YAML)

Each page keeps its static UI settings in `config.yaml` beside it
(`RawLitho/`, `UploadData/`, `DatabaseViewer/`). Settings shared by every page
live in `config/ui.yaml` (read by `config/uiConfig.ts`): today the toast
durations — error 5000 ms, warning 3000 ms, success 3000 ms, info 3000 ms. No
component sets its own duration. Vite bundles the file as text
(`import text from "./config.yaml?raw"`), and the page's `config.ts` parses it
once, when the module loads, using the `yaml` package. It copies each value into
a typed object through `createConfigReader` (`config/yamlConfig.ts`).

The reader is strict. It rejects:
- invalid YAML;
- a missing key;
- a wrong type;
- an out-of-range number;
- an unknown column key;
- for Raw Litho, a persisted field missing from the column list.

The error names the file and key, so a broken config fails at start-up and in
`npm test` (`tests/yamlConfig.test.ts`) instead of rendering a wrong page. YAML
holds values only. Field definitions, required fields and validation rules stay
in TypeScript.

## Conventions

- Components and pages: `PascalCase` files and functions.
- Hooks: `useCamelCase`, one concern each, in the page's `hooks/` folder.
- Services and utilities: `camelCase`. No React imports in `services/`.
- Fixed values: `UPPER_SNAKE_CASE` (`RAW_LITHO_ROWS_PER_PAGE`).
- Styling: Tailwind utilities (see *Styling*). Unstyled marker classes keep the
  `kebab-case` page prefix and `--modifier` form (`raw-litho-cell--missing`).
- Static UI values (titles, column labels / widths / visibility, row heights,
  overscan, page sizes, mock-data settings) live in the page's `config.yaml`;
  rules and behaviour stay in TypeScript.
- Guard clauses and early returns over nested conditionals; event handlers stay
  one or two levels deep by delegating to small helpers.
- Pure logic (validation, normalisation) lives in its own module, separate from
  the components and from user-facing text.

## TypeScript conventions

- Shared domain contracts belong in `src/types/domain.ts`. The persisted Raw Litho
  field union, `ColumnDefinition`, complete keyed schema and row defaults belong
  together in `src/types/rawLithoSchema.ts`. Add new fields there; every field needs
  a matching definition and default. Keep visible ordering in `pages/RawLitho/config.yaml` so
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
2. Style it with Tailwind utilities and the `rl-*` tokens; put configurable
   values in `YourPage/config.yaml` with a `config.ts` reader built on
   `createConfigReader`.
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
