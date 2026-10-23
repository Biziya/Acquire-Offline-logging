# Database Viewer page

Route: `/database-viewer`

## Purpose

Read-only view of the records stored in the database for one drillhole
(`GET /api/dataviewer?drillhole=<HOLEID>`, `MyApps.CoreDescrData`), laid out
exactly like the Raw Litho table. Nothing is edited, written or calculated.

## Files

```text
DatabaseViewer/
├── DatabaseViewer.tsx        page: drillhole selection, status line, toast
├── DatabaseViewerTable.tsx   read-only virtualized table in Raw Litho's look
├── databaseViewerRows.ts     database rows → one row per interval (pure)
├── databaseViewerStore.ts    page state for the session (survives navigation)
├── databaseViewerTypes.ts    API response types
├── config.ts / config.yaml   title, overscan
└── README.md
```

The request lives in `services/Api/dataViewerApi.ts` (`getDataViewerRecords`),
which validates the response before it is used.

## Table — same as Raw Litho

The database keeps one row per interval and attribute (`NAME` / `VALUE`). The
viewer shows one row per interval with **Raw Litho's own column list**
(`tableColumns` and `INDEX_COLUMN_WIDTH` from `RawLitho/constants.ts`), so
headers, order, widths, the "Ins" column, row height and minimum width can
never differ from Raw Litho. Frame, header, cells, zebra rows and hover come
from the shared `components/dataTableStyles.ts`; cell text uses Raw Litho's
cell font size. Only Raw Litho's required-field `*` is left out (nothing is
entered here).

`NAME` → column is the upload procedure's mapping read backwards:

| `NAME` | Column |
| --- | --- |
| `LithoFacies` | Litho Code |
| `Colour` | Color Code |
| `CA` / `OM` / `OX` | CA / OM / OX |
| `InternalStructure` | Sedim |
| `RedoxFacies` | Redox Code |
| `LithologyComments` | Lithology Comments |
| `Granulo` / `Hardness` | Granulo / Hardness |

- Rows that share `FROM`, `TO`, `PRIORITY`, `usr` and `PROJECTCODE` form one
  interval, in the API's order. Uploads by different logins stay separate rows.
- A value is `VALUE`, or `COMMENT_VALUE` when `VALUE` is empty (comments). Values
  are copied unchanged; `NULL` is an empty cell.
- Litho From / To show at least two decimals, never rounded (`5` → `5.00`).
- OM Facies and PY stay empty: the upload procedure does not store them.
- A stored value without a Raw Litho column (another `NAME`, or a repeated
  one) is not shown; the page says how many, so nothing disappears silently.
- The status line shows intervals and stored values, and who stored them
  (`usr`) from which file (`FileName`).

## State across pages

React Router unmounts a page when you leave it, so the viewer keeps its state
in `databaseViewerStore.ts` (a small store read with `useSyncExternalStore`)
for the browser session:

- the selected drillhole, its Project and Campaign, the loaded records and
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
