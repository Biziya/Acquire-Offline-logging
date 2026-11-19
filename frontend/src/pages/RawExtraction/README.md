# Raw Extraction page

Route: `/raw-extraction`

## Purpose

The core runs (extraction passes) of one drillhole, laid out like the old
desktop *Raw Extraction* screen and styled like the rest of the website.

**The page is not connected to the database yet.** Every drillhole shows the
same 20 sample runs. Edits stay in memory only: choosing another drillhole, or
reloading, brings the sample back. Nothing is saved, and there are no Save,
Delete Recovery or Core phase list buttons.

## Files

```text
RawExtraction/
├── RawExtraction.tsx             page: drillhole selector, rows in memory, toast
├── RawExtractionTable.tsx        editable virtualized table in Raw Litho's look
├── rawExtractionColumns.ts       columns, dropdown lists, row type
├── rawExtractionSampleRows.ts    the sample core runs
├── config.ts / config.yaml       title, overscan
└── README.md
```

## Drillhole selector

This is the same selector as Raw Litho (`RawLithoFilters`), with the same list
(`useDrillholes`: `/api/drillholes`, the IndexedDB fallback, and recent
drillholes first). Project and Campaign come from the selected drillhole.
Raw Litho drafts don't change the order here.

## Table

| Column | Cell |
| --- | --- |
| Extraction Type | dropdown: CAROTTE, DESTRUCTIF |
| Coring Method | dropdown: Double / Triple / Single tube coring |
| Core Pass #, Start Depth (m), End Depth (m), Recovered (m), Recovery (%), Mud Layer (%), Mud Imp (%) | number input |

- **Lists:** the dropdowns use `LookupAutocomplete` with local placeholder lists. Replace them with the real lists when the page is connected.
- **Look and keys:** the "No." column, row height, minimum width, frame, header, zebra rows and arrow and Tab movement all come from Raw Litho.
- **No calculations or checks yet:** Recovery (%) is not worked out from the depths, and nothing is validated.

## Configuration

`config.yaml` holds `title` and `table.overscan`. The columns are in
`rawExtractionColumns.ts`.
