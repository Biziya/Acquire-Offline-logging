# Database Viewer page

Route: `/database-viewer` (sidebar: **Database Viewer**)

## Purpose

Read-only table of lithology records. **Mock data only for now**: records are
generated in the browser, nothing is requested from the backend, and a
"Mock data" banner stays visible so the table is never mistaken for production
records. There is no editing, deleting, creating or uploading, and no SQL Server
connection.

The page looks like Raw Litho (same tokens, header, grid, row height and
controls) but shares no state or logic with it.

## Folder tree

```text
DatabaseViewer/
├── config.yaml                 title, table sizes, columns, search, mock settings
├── config.ts                   typed, validated copy of config.yaml
├── DatabaseViewer.tsx          page: filters, search, count, refresh
├── DatabaseViewerTable.tsx     virtualized read-only table
├── databaseViewerMockData.ts   MOCK record generator
├── databaseViewerTypes.ts      LithologyRecord + column keys
└── README.md                   this file
```

## Mock data

`generateMockLithologyRecords(size, seed, settings)` builds records
programmatically — no fixture file. It is seeded, so the same size and seed
always give the same records and the same ids (`1…n`). Every project, campaign
and drillhole starts with `MOCK-`. Intervals are contiguous within each
drillhole. Codes are plausible shapes, **not** the API lookup tables.

The dataset is generated in a `useMemo` keyed on size and seed, so it is built
once per choice, never per render. **Refresh** (next to the record count) moves
to the next seed; the **Mock records** selector picks 10,000, 50,000 or
100,000 (from `config.yaml`).

## Table and filters

- Virtualized with `@tanstack/react-virtual`: only visible rows plus `overscan`
  are in the DOM; two spacer rows keep real `<table>` layout and the sticky
  header. Rows are keyed by record id. Wide tables scroll horizontally.
- **Search** across the visible columns, debounced; each record's search text
  is built once per dataset, so a search is one substring test per record.
- **Project → Campaign → Drillhole** filters cascade (choosing a project resets
  the narrower filters). **Clear filters** resets all of them.
- "Showing X of Y records" reflects the filtered count.

## Configuration

`config.yaml`: `title`, `table.rowHeight` / `overscan` / `minWidth` /
`indexColumnWidth`, the column list (label, width, visibility), the search
debounce, and `mockData` (offered sizes, default size, and how many projects,
campaigns and drillholes to generate). Parsed and validated once at module
load; a bad value fails start-up with the file and key in the error.

## Connecting the real database later

Replace the `useMemo` that calls the generator with a request, keep
`LithologyRecord` as the row shape, and point Refresh at the reload. The table,
filters and search do not depend on where the records came from.

## Manual test checklist

1. Open Database Viewer from the sidebar → the mock banner and 10,000 records show.
2. Switch to 100,000 → scrolling stays smooth; the DOM holds only a few dozen rows.
3. Choose a project, campaign and drillhole → the count narrows; Clear filters restores it.
4. Search for a code → only matching records remain.
5. Press Refresh → new mock values appear and the network tab shows no request.
