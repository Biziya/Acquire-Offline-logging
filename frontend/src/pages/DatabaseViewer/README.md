# Database Viewer page

Route: `/database-viewer`

## Purpose

A read-only view of the lithology stored in SQL Server
(`[ACQMN01].[MyApps].[CoreDescrData]`, written by Upload Data) for one
drillhole, laid out like the Raw Litho table. The page edits, writes and
calculates nothing, and has no add, remove, save or upload controls.

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

Requests live in `services/Api/dataViewerApi.ts`, which checks every response
before it is used.

| Request | Used for |
| --- | --- |
| `GET /api/dataviewer/drillholes` | The drillhole selector: every distinct, non-blank `HOLEID` in `CoreDescrData`, sorted |
| `GET /api/dataviewer?drillhole=<HOLEID>` | The selected drillhole's intervals, Project and Campaign |

## Drillhole selector

The page reuses Raw Litho's selector component (`RawLithoFilters`), with the
same search order (exact, then prefix, then substring), keyboard navigation
and clear button. Its list is the Data Viewer's own, so a drillhole without
stored records never appears. Raw Litho's `/api/drillholes` list and its
IndexedDB data are not used, and there is no recent drillholes section.

The list is kept for the browser session. Coming back to the page shows it at
once and refreshes it in the background, so new uploads appear. If the first
load fails, the field is disabled and an error toast says "Couldn't load the
drillhole list. Check that the server is online."

## Project and Campaign

Both come from the backend.

- Project is the stored `PROJECTCODE` of the drillhole's rows.
- Campaign is not in `CoreDescrData`. The backend takes it from the drillhole
  list (`ZOOVCH_COLLAR_LIST`, `RIGHT(PROSPECT, 4)`) for the same `HOLEID` and
  `PROJECTCODE`. If there is no entry, or the entries disagree, it shows `—`.
- A drillhole stored under several projects shows all of them
  (`ZOOVCH, OTHER` / `2015, —`). Each table row belongs to one project.

## Table

The backend turns the database's one row per attribute (`NAME` / `VALUE`)
into one row per interval (see *Data Viewer* in the backend README). The
table uses Raw Litho's `tableColumns` and `INDEX_COLUMN_WIDTH` from
`RawLitho/constants.ts`, and `rowHeight` and `minWidth` from
`RawLitho/config.yaml`, so headers, order, widths, the "Ins" column and row
height match Raw Litho. Frame, header, cells, zebra rows and hover come from
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

- There is one row per `PROJECTCODE`, `FROM`, `TO`, `PRIORITY` and `usr`, in
  `FROM`, `TO` order. Different priorities or logins stay separate rows.
- Values are shown as stored. A value that is not stored is an empty cell.
- Litho From and Litho To show at least two decimals and are never rounded
  (`5` shows as `5.00`).
- OM Facies, PY and the other Raw Litho-only fields stay empty, because the
  upload procedure does not store them.
- Stored values with no Raw Litho column (another `NAME`, or a repeat) are not
  shown. The page says how many there are.
- The status line shows the number of intervals and stored values, plus who
  stored them (`usr`) and from which file (`FileName`).
- Only the rows in view plus `overscan` are rendered. Rows are keyed by their
  interval, not their position.

## State across pages

React Router unmounts a page when you leave it, so the viewer keeps its state
in `databaseViewerStore.ts` (a small store read with `useSyncExternalStore`)
for the browser session.

- The selected drillhole, its Project and Campaign, the loaded intervals and
  the scroll position come back when you return, without a new request.
- A request still running when you leave finishes into the store.
- Choosing another drillhole aborts the previous request, so an older answer
  never replaces a newer choice. Retry (shown after an error) asks again.
- Nothing is written to browser storage, so a page reload starts empty.

## States

| State | Status line | Table |
| --- | --- | --- |
| nothing selected | No drillhole selected | Select a drillhole to view its records. |
| loading | Loading records… | Loading records… |
| loaded | `N intervals · M stored values` | the rows, or "No records are stored for this drillhole." |
| error | Records unavailable, with a Retry button | Unable to load the records. |

A failed record load also shows the error toast "Couldn't load this
drillhole's records. Check that the server is online." for 5 seconds.

## Configuration

`config.yaml` holds `title` and `table.overscan`. Columns and table size come
from `RawLitho/config.yaml`.
