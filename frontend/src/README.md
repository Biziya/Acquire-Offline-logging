# Frontend source

A map of `src/`. Setup and scripts are in the [frontend README](../README.md).

## Folders

```text
src/
├── main.tsx            entry point: StrictMode, HashRouter, css/index.css, sets document.title
├── App.tsx             access check, then the sidebar and the routes
├── appVersion.d.ts     declares __APP_VERSION__ (package.json version, shown in the sidebar)
├── assets/             images that nothing imports
├── components/         UI shared by the shell and several pages
│   ├── Sidebar.tsx            navigation, signed-in user, backend status, version
│   ├── StatusIndicator.tsx    polls GET /api/status
│   ├── KeyboardShortcuts.tsx  help button and the shortcuts popup
│   ├── ConfirmDialog.tsx      the confirmation modal used by Raw Litho and Upload Data
│   ├── NewYearGreeting/       New Year card from the Data team; dates and text in its config.yaml
│   ├── Toast.tsx              the one toast used by every page
│   ├── PageTitle.tsx          page heading
│   ├── useAnchoredMenuStyle.ts  keeps a portalled dropdown under its input
│   ├── uiStyles.ts            buttons, panels, headings, focus ring
│   ├── dataTableStyles.ts     table look, CELL_INPUT, toPercentWidths
│   ├── fieldStyles.ts         field label, input/select, read-only value
│   └── dropdownStyles.ts      look of the custom dropdown menus
├── config/
│   ├── yamlConfig.ts   createConfigReader, the strict reader for config.yaml files
│   ├── ui.yaml         app-wide settings: appName, toast durations
│   └── uiConfig.ts     typed, validated copy of ui.yaml
├── css/index.css       Tailwind entry, rl-* design tokens, keyframes, base layer
├── hooks/
│   ├── useAccessCheck.ts            website access (AD group), rechecked over time
│   ├── useCurrentUser.ts            verified Windows user, or null
│   ├── useCachedWindowsIdentity.ts  last known user for the sidebar, works offline
│   └── useToast.ts                  one notification at a time
├── other/              sample JSON export, kept for reference, not imported
├── pages/
│   ├── RawLitho/       data entry (own README)
│   ├── UploadData/     check and upload an exported JSON file (own README)
│   ├── DatabaseViewer/ read-only stored records of one drillhole (own README)
│   └── AccessDenied/   shown instead of the app when access is denied or unverified
├── services/           API clients, IndexedDB, lookup config, current user (own README)
├── types/
│   ├── domain.ts         shared domain types
│   ├── rawLithoSchema.ts persisted Raw Litho fields, column definitions, row defaults
│   └── validation.ts     runtime guards for API, JSON and storage data
└── utils/format.ts     formatCount: thousands separators for counts
```

Page READMEs: [Raw Litho](pages/RawLitho/README.md),
[Upload Data](pages/UploadData/README.md),
[Database Viewer](pages/DatabaseViewer/README.md),
[services](services/README.md).

## Routes

| Route | Component |
| --- | --- |
| `/raw-litho` | `pages/RawLitho/RawLitho.tsx` |
| `/upload-data` | `pages/UploadData/UploadData.tsx` |
| `/database-viewer` | `pages/DatabaseViewer/DatabaseViewer.tsx` |
| `/` and anything else | redirects to `/raw-litho` |

Until `useAccessCheck` reports `allowed`, `App.tsx` renders `AccessDenied`
instead of the sidebar and routes.

## Styling

Tailwind CSS 4 through `@tailwindcss/vite`. There is no `tailwind.config.js`:
the colour tokens (`--color-rl-*`) are declared in `@theme` in `css/index.css`.
Components write utilities inline. Class lists used in more than one place go
in the `*Styles.ts` files in `components/` (or `pages/UploadData/uploadDataStyles.ts`),
always written out in full so Tailwind can find them. Column widths and row
heights come from YAML and are applied as inline styles. Pages must not scroll
sideways: tables use proportional widths (`toPercentWidths`) and scroll inside
their own frame below their minimum width.

## Configuration

Each page keeps its static UI settings in a `config.yaml` next to it, read by
its `config.ts` through `createConfigReader`. The reader rejects invalid YAML,
missing keys, wrong types, out-of-range numbers and unknown column keys, and
names the file and key in the error. `tests/yamlConfig.test.ts` covers it.
YAML holds values only. Fields, required fields and validation rules stay in
TypeScript.

## Conventions

- Components and pages use `PascalCase`, hooks `useCamelCase`, services and
  utilities `camelCase`, fixed values `UPPER_SNAKE_CASE`.
- `services/` has no React imports. Components do not call `fetch` directly.
- Accept `unknown` at API, JSON and storage boundaries, validate it, then pass
  domain types inside the app.
- Add a new Raw Litho field in `types/rawLithoSchema.ts` with its definition
  and default. Its visible order and width go in `pages/RawLitho/config.yaml`.
- Keep strict mode and `noUncheckedIndexedAccess` on. No `any`, unsafe or
  non-null assertions, `@ts-ignore` or `@ts-expect-error`.
- Call application documents `lithoDocument` or `draft`; `document` is the
  browser global.

## Adding a page

1. Create `pages/YourPage/YourPage.tsx`, with a `config.yaml` and `config.ts`
   if it has configurable values.
2. Add a `Route` in `App.tsx` and a `NavLink` in `components/Sidebar.tsx`.
3. Put API calls in `services/Api/` and local storage in `services/IndexDB/`.
4. Add a README for the page and update this map.
