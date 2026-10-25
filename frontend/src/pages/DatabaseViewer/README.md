# Database Viewer page

Route: `/database-viewer`

## Purpose

Read-only view of the lithology stored in SQL Server
(`[ACQMN01].[MyApps].[CoreDescrData]`, written by Upload Data) for one
drillhole, laid out exactly like the Raw Litho table. Nothing is edited,
written or calculated; there are no Add / Remove / Save / Upload controls.

## Files

```text
DatabaseViewer/
├── DatabaseViewer.tsx           page: drillhole selection, status line, toast
├── DatabaseViewerTable.tsx      read-only virtualized table in Raw Litho's look
├── useDataViewerDrillholes.ts   the drillholes that have stored records
├── databaseViewerStore.ts       page state for the session (survives navigation)
├── databaseViewerTypes.ts       API response types, row key
├── config.ts / config.yaml      title, overscan
└── README.md
```

Requests live in `services/Api/dataViewerApi.ts`, which validates every
response before it is used:

| Request | Used for |
| --- | --- |
| `GET /api/dataviewer/drillholes` | The Drillhole selector: every distinct, non-blank `HOLEID` in `CoreDescrData`, sorted |
| `GET /api/dataviewer?drillhole=<HOLEID>` | The selected drillhole's intervals, Project and Campaign |

## Drillhole selector

The Raw Litho selector component (`RawLithoFilters`), with the same search
(exact → prefix → substring), keyboard navigation and clear button — but fed
with **Data Viewer's own list**, not Raw Litho's `/api/drillholes` or its
IndexedDB data. A drillhole without stored records is never offered. There is
no Recent Working Drillholes section here.

The list is kept for the browser session: returning to the page shows it at
once and refreshes it in the background (so newly uploaded drillholes
appear). If the first load fails, the field is disabled and an error toast
says "Unable to load drillholes".

## Project and Campaign

Both come from the backend:

- **Project** is the stored `PROJECTCODE` of the drillhole's rows.
- **Campaign** is not in `CoreDescrData`; the backend takes it from the
  drillhole list (`ZOOVCH_COLLAR_LIST`, `RIGHT(PROSPECT, 4)`) for the same
  `HOLEID` **and** `PROJECTCODE`. No entry, or entries that disagree: "—".
- A drillhole stored under several projects shows them all
  (`ZOOVCH, OTHER` / `2015, —`), never one picked at random; each table row
  belongs to exactly one project.

## Table — same as Raw Litho

The backend turns the database's one-row-per-attribute (`NAME` / `VALUE`)
into one row per interval (backend README, *Data Viewer*). The table shows
them with **Raw Litho's own column list** (`tableColumns` and
`INDEX_COLUMN_WIDTH` from `RawLitho/constants.ts`), so headers, order, widths,
the "Ins" column, row height and minimum width can never differ from Raw
Litho. Frame, header, cells, zebra rows and hover come from the shared
`components/dataTableStyles.ts`.

| `NAME` | Column |
| --- | --- |
| `LithoFacies` | Litho Code |
| `Colour` | Color Code |
| `RedoxFacies` | Redox Code |
| `CA` / `OM` / `OX` | CA / OM / OX |
| `InternalStructure` | Sedim |
| `Granulo` / `Hardness` | Granulo / Hardness |
| `LithologyComments` | Lithology Comments (`COMMENT_VALUE`, or `VALUE` when that is empty) |
| `[FROM]` / `[TO]` | Litho From / Litho To |

- One row per `PROJECTCODE`, `FROM`, `TO`, `PRIORITY` and `usr`, in `FROM`,
  `TO` order. Different priorities or logins stay separate rows.
- Values are shown unchanged; a value that is not stored is an empty cell.
- Litho From / To show at least two decimals, never rounded (`5` → `5.00`).
- OM Facies, PY and the other Raw Litho-only fields stay empty: the upload
  procedure does not store them.
- Stored values without a Raw Litho column (another `NAME`, or a repeat) are
  not shown; the page says how many, so nothing disappears silently.
- The status line shows intervals and stored values, and who stored them
  (`usr`) from which file (`FileName`).
- Virtualized: only the rows in view (plus `overscan`) are in the DOM. Rows
  are keyed by their interval identity, not by position.

## State across pages

React Router unmounts a page when you leave it, so the viewer keeps its state
in `databaseViewerStore.ts` (a small store read with `useSyncExternalStore`)
for the browser session:

- the selected drillhole, its Project and Campaign, the loaded intervals and
  the table's scroll position are back when you return — **no new request**;
- a request still running when you leave completes into the store;
- choosing another drillhole aborts the previous request, so an older answer
  can never replace a newer selection; **Retry** (after an error) asks again;
- independent of Raw Litho; nothing is written to browser storage, so a page
  reload starts empty.

## States

| State | Status line | Table |
| --- | --- | --- |
| nothing selected | No drillhole selected | Select a drillhole to view its records. |
| loading | Loading records… | Loading records… |
| loaded | `N intervals · M stored values` | the rows, or "No records are stored for this drillhole." |
| error | Records unavailable + **Retry** | Unable to load the records. — plus the shared error toast (5 s) |

## Configuration

`config.yaml`: `title`, `table.overscan`. Columns and table size come from
`RawLitho/config.yaml`.
