# Database Viewer page

Route: `/database-viewer`

## Purpose

Read-only view of the records stored in the database for one drillhole:
`GET /api/dataviewer?drillhole=<HOLEID>`, which reads
`MyApps.CoreDescrData` (`ACQMN01_DEV`) filtered by `HOLEID`. Nothing is
edited, written or calculated; values are shown as the database holds them.

## Files

```text
DatabaseViewer/
├── DatabaseViewer.tsx        page: drillhole selection, request, states, toast
├── DatabaseViewerTable.tsx   read-only virtualized table
├── databaseViewerTypes.ts    API response types and the table columns
├── config.ts / config.yaml   title, overscan, table minWidth
└── README.md
```

The request lives in `services/Api/dataViewerApi.ts` (`getDataViewerRecords`),
which validates the response before the page sees it.

## Layout

```text
Database Viewer
Drillhole [search ▾]   Project [ZOOVCH]   Campaign [2015]
Database Records   53 records   [Retry — only after an error]
┌ # │ HOLEID │ PROJECTCODE │ FROM │ TO │ PRIORITY │ NAME │ VALUE │ … │ Imported_by ┐
```

- **Drillhole** is Raw Litho's own selector (`RawLithoFilters` +
  `useDrillholes`): the same list from `GET /api/drillholes` (or its offline
  cache), the same search. Selecting here does not change Raw Litho's
  "recent drillholes".
- **Project / Campaign** are the values the Data Viewer API returns for the
  drillhole (resolved by the backend from the Drillholes query). `—` while
  nothing is loaded, or when the API returns `null` (no single match — never
  guessed).

## Table

One row per database row — the table stores one row per interval and
attribute (`NAME` / `VALUE`), and the viewer does not pivot or merge them.
Columns are the database columns in query order, labelled with their database
names (`databaseViewerTypes.ts`); rows keep the API's order
(`FROM, TO, PRIORITY, NAME`).

| Value | Shown as |
| --- | --- |
| `NULL` | empty cell (nothing filled in) |
| `FROM` / `TO` numbers | at least two decimals, never rounded: `5` → `5.00`, `12.125` → `12.125` |
| other numbers, text, dates | exactly as received (`2026-10-22T10:00:00`) |

The table is virtualized like Raw Litho's (only the visible rows plus
`overscan` are rendered) and borrows its row height and index-column width.
It scrolls horizontally inside its frame below `table.minWidth`.

## States

| State | Status text | Table |
| --- | --- | --- |
| nothing selected | No drillhole selected | Select a drillhole to view its records. |
| loading | Loading records… | Loading records… |
| loaded | `N records` | the rows, or "No records are stored for this drillhole." |
| error | Records unavailable + **Retry** | Unable to load the records. — plus the shared error toast (5 s) |

**Stale results.** Each selection aborts the previous request
(`AbortController`) and only the latest request may update the page, so a
slow answer for an earlier drillhole can never replace the current one.
Leaving the page cancels a request still in flight.

## Configuration

`config.yaml`: `title`, `table.overscan`, `table.minWidth`. Parsed and
validated once at load; a bad value fails start-up (and `npm test`) with the
file and key in the error.
