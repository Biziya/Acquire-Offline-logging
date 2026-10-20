# Database Viewer page

Route: `/database-viewer` (sidebar: **Database Viewer**)

## Purpose

Read-only table of the lithology records of one drillhole. **Mock data only for
now**: records are generated in the browser, nothing is requested from the
backend, and a "Mock data" banner stays visible so the table is never mistaken
for production records. There is no editing, deleting, creating, saving or
uploading, no IndexedDB, and no SQL Server connection.

## Folder tree

```text
DatabaseViewer/
├── config.yaml                 title, overscan, mock-data settings
├── config.ts                   typed, validated copy of config.yaml
├── DatabaseViewer.tsx          page: drillhole selector, Project/Campaign, count
├── DatabaseViewerTable.tsx     virtualized read-only table
├── databaseViewerMockData.ts   MOCK record generator
├── databaseViewerTypes.ts      LithologyRecord + column keys
└── README.md                   this file
```

## Page layout

```text
Database Viewer                                   [Mock data banner]
Drillhole [select ▼]   Project [read-only]   Campaign [read-only]   Mock records [10,000 ▼]
Dataset Records  139 records
| Ins | Litho From (m) | Litho To (m) | Litho Code | … | Hardness |
```

- **Drillhole** is the only filter. It is a native `<select>`, so typing the
  first characters jumps to a matching drillhole. There is no separate search,
  Project / Campaign filter or Clear button.
- **Project** and **Campaign** are `<output>` elements: they show the selected
  drillhole's values and cannot be edited.
- With no drillhole selected the table is empty and says so; the count reads
  "No drillhole selected". Choosing one shows its records and its count.

## Same look as Raw Litho, read-only

The table reproduces the Raw Litho table:

- **Columns, labels, widths, row height, minimum width:** read from Raw
  Litho's `config.yaml`, through `rawLithoConfig`. They are not duplicated
  here, so changing a Raw Litho column changes both tables.
- **Header, grid, zebra rows, hover tint, cell font, frame:** come from the
  shared `components/dataTableStyles.ts`.
- **Index column:** reads `Ins` and counts from 1 within the drillhole.

Only the configuration and the styles are shared. Nothing from Raw Litho's
workspace, persistence, validation, navigation or editing code is imported.

Cells are plain text, with no inputs or lookups, and there are no row or save
buttons. Raw Litho's required-field `*` markers are left out because they
only mean something when editing. A long value is truncated with an ellipsis
and shown in full in the cell's tooltip.

The column widths are proportions, so the table fills the page width without
horizontal scrolling. Below Raw Litho's `minWidth` (760 px of table), for
example on a narrow window with the sidebar expanded, the table scrolls inside
its own frame instead of squeezing cells.

## Mock data

`generateMockLithologyRecords(size, seed, settings)` builds records
programmatically; there is no fixture file. The page always uses the same seed
(`MOCK_SEED`), so a given size always gives the same records and the same ids
(`1…n`).

- **Labelling:** every project, campaign and drillhole starts with `MOCK-`.
- **Fixed identity:** drillhole names and each drillhole's project and campaign
  are fixed by its position, not by the random values. A drillhole keeps its
  Project and Campaign when the size changes, and so does the current
  selection.
- **Depths:** intervals are contiguous within each drillhole.
- **Codes:** plausible shapes, **not** the API lookup tables.

The dataset is generated and grouped by drillhole in one `useMemo` keyed on
the size. It is built once per choice, never per render, and choosing a
drillhole is a map lookup. Each group is ordered by Litho From.

There is no Refresh button. **Mock records** picks 10,000, 50,000 or
100,000 records in total, about 139, 694 or 1,389 per drillhole with the
default 72 drillholes.

## Scrolling

Virtualized with `@tanstack/react-virtual`. Only the visible rows plus
`overscan` are in the DOM, and two spacer rows keep real `<table>` layout and
the sticky header. Rows are keyed by record id. Choosing another drillhole
starts at the top of its records.

## Configuration

`config.yaml` holds `title`, `table.overscan` and `mockData`: the offered sizes,
the default size, and how many projects, campaigns and drillholes to generate.
It is parsed and validated once at module load; a bad value fails start-up
with the file and key in the error. The table's appearance is configured in
`RawLitho/config.yaml` (see above).

## Connecting the real database later

1. Replace the `useMemo` that generates and groups mock records with a request
   for the selected drillhole.
2. Keep `LithologyRecord` as the row shape.

The table does not depend on where the records came from.

## Manual test checklist

1. Open Database Viewer → mock banner, "No drillhole selected", empty table.
2. Choose a drillhole → Project and Campaign fill in (read-only), the count and table update, rows run in Litho From order.
3. Put Raw Litho and Database Viewer side by side → identical columns, widths, header and rows.
4. Switch to 100,000 records and a drillhole → smooth scrolling; only a few dozen rows are in the DOM.
5. Confirm there is no Refresh button and the network tab shows no request.
6. Narrow the window to ~1024 px → no horizontal scrollbar on the page or the table.
