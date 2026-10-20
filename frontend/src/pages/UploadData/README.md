# Upload Data page

Route: `/upload-data`

## Purpose

Loads a Raw Litho JSON export, lets the user review and correct every record in
an editable, virtualized table, validates the result, and uploads it to
`POST /api/uploaddata`. Nothing is stored: edits live in memory and are cleared
by **Cancel**, choosing another file, or a page refresh. The page uses no
IndexedDB and no Local Storage.

## Folder tree

```text
UploadData/
├── config.yaml              title, table sizes, columns, search debounce
├── config.ts                typed, validated copy of config.yaml
├── DatasetSummary.tsx       2. Dataset Information
├── README.md                this file
├── UploadData.tsx           page container: file, working document, upload
├── UploadDataTable.tsx      3. Editable JSON Preview (virtualized)
├── uploadDataDocument.ts    the working document and its edit function
├── uploadDataStyles.ts      Tailwind class lists shared by the sections
├── uploadDataValidation.ts  pure validation of the working document
├── UploadFileSection.tsx    1. File Selection
└── ValidationSummary.tsx    4. Validation Summary
```

## Page structure

```text
Upload Data
├── 1. File Selection         drop zone + Browse Files; errors shown inline
├── 2. Dataset Information    file, project, campaign, drillhole, created by,
│                             uploaded by, total records, file size, status
├── 3. Editable JSON Preview  search, status filter, record count, table
├── 4. Validation Summary     total / valid / warning / invalid + document issues
└── Actions                   Cancel · Import Data (→ confirmation)
```

The sections sit in a one-column grid (`grid-cols-[minmax(0,1fr)]`), so no
section can be wider than the page: a table narrower than its readability floor
scrolls inside its own frame, and the page never scrolls sideways.

## Choosing a file: Browse Files or drag and drop

```text
Browse Files ─┐
              ├─▶ handleFileSelect(file)   type check → parse → working document
drop on zone ─┘
```

- **One handler:** both routes call `handleFileSelect` in `UploadData.tsx`.
  The type check, JSON parsing and validation exist only there.
- **Drag feedback:** while a file is dragged over the zone it turns blue and
  reads "Drop the JSON file here". Leaving the zone, or moving over its child
  elements, is handled correctly.
- **Rejected files:** one file at a time. Dropping several shows "Drop one JSON
  file at a time." A file that is not `.json` / `application/json` shows
  "`<name>` is not a JSON file." In both cases the dataset already loaded, with
  its edits, is kept.
- **Valid files:** a valid file replaces the current dataset, just as choosing
  one with Browse Files does. Nothing is uploaded until **Import Data** is
  confirmed.
- **Drops beside the zone:** while the page is open, a window-level listener
  stops the browser from opening a file dropped next to the zone, which would
  discard the page.
- **Choosing the same file again** still works: the file input is cleared after
  every pick.

### Created By and Uploaded By

These are two different people, and neither is ever guessed:

| Field | Source | When missing |
| --- | --- | --- |
| Created By | `created_by` in the selected JSON file (written by Raw Litho) | `Unavailable` — e.g. an older file |
| Uploaded By | the signed-in Windows user from `useCurrentUser()` | `Unavailable` |

**Uploaded By always shows `Unavailable` today.** No trusted identity source
exists yet: a browser cannot read the Windows login, and the API has no
authentication or "current user" endpoint. See `src/services/currentUser.ts`
for exactly what the backend needs; once it exists, this page shows the user
with no further change.

Uploading never changes `created_by`, and the uploader is not written into the
file. The backend contract (`POST /api/uploaddata`) has no uploader field. The
server ignores unknown fields such as `created_by`, so it neither rejects nor
stores it. Recording the uploader belongs on the server, from its
authenticated request, once Windows Authentication is enabled.

## The working document

`handleFileSelect` parses the file once; the parsed object is the single
authoritative working document (`workingDocument`). The selected `File` is
never modified.

`applyCellEdits` (in `uploadDataDocument.ts`) returns the next document,
copying only the rows that change. Untouched rows keep their identity, and every
key of the document and of each row — known, hidden (`visible: false` columns)
or extra — is kept exactly. A depth that was a JSON number stays a number when
the new text is numeric. Comment text is stored exactly as typed, spaces
included. Values that are JSON objects or lists are shown read-only and are
never overwritten.

Because the table reads every value from the working document on render, an
edit survives its row scrolling out of the virtual window and back.

## Editable preview

- **Virtualized** with `@tanstack/react-virtual`: only the rows in view plus
  `overscan` are in the DOM, so 100,000 records stay responsive. Row height,
  overscan, maximum height and columns come from `config.yaml`.
- **Height follows the records**: the preview is as tall as its rows, up to
  `maxHeightVh` percent of the window, then scrolls inside its frame. A small
  file no longer leaves a large empty table box.
- **Search** across the visible columns (debounced) and a **status filter**
  (all / invalid / warnings / valid). A record edited while a filter is active
  stays listed until the filter changes, so it does not vanish under the caret.
- **Keyboard**: `Tab` / `Shift`+`Tab` move to the next / previous cell and wrap
  across records; `←` / `→` do the same once the caret is at the edge of the
  text; `↑` / `↓` and `Enter` move within the column. A target outside the
  rendered window is scrolled into view and focused after it renders.
- **Selection**: `Ctrl` (or `⌘`) + click toggles a cell; a plain click on a cell
  outside the selection clears it; `Escape` clears it.
- **Copy**: `Ctrl`+`C` with a selection copies its bounding rectangle as
  tab-separated text; unselected cells inside it are written empty.
- **Paste**: one value with a selection fills every selected cell; a block
  (tabs = columns, newlines = rows, e.g. from Excel) is pasted with its top-left
  corner on the focused cell and is refused if it would run past the table.
  Read-only cells are left unchanged and counted in the notice. Without a
  selection, a single value is a normal input paste. A clipboard that cannot be
  read changes nothing.
- **Lookups**: lookup cells offer the codes loaded from the API as suggestions.
  When a lookup cannot be loaded its codes are reported as "not checked" —
  never guessed.

## Validation

`validateUploadDocument` is pure and runs on a deferred copy of the document,
so typing stays responsive; **Import Data** re-validates the latest document.
No new business rules are introduced:

| Severity | Checks |
| --- | --- |
| error (blocks upload) | missing project / drillhole; `rows` missing or empty; a row that is not an object; non-whole-number id; empty or non-numeric depth; non-text value in a text field; invalid timestamp; Litho From > Litho To; duplicate interval; unknown lookup code (when the lookup is loaded) |
| warning | required field empty; campaign or timestamp missing; lookup data still loading or unavailable |

Invalid and warning cells are highlighted, the status column shows ✓ / ! / ✕
with the messages as a tooltip, and the summary shows the counts.

## Uploading

```text
Import Data → handleImportRequest()   re-validate; blocking errors → message, stop
            → confirmation panel      "Import N records?"  Back / Confirm import
Confirm     → handleImport()
  unchanged → the original file
  edited    → new File(JSON.stringify(workingDocument, null, 2), same name)
  POST /api/uploaddata   multipart/form-data, field "file"
    ok    → success message (only after the server confirms)
    error → server message
    abort → ignored
```

The request carries an `AbortController` signal; a second click cannot submit
twice, and **Cancel** aborts an in-flight upload and clears the page. File reads
are guarded by `fileSelectionIdRef`, so a slow read of an older selection never
replaces a newer one.

## Configuration

`config.yaml` holds the page title, `rowHeight`, `overscan`, preview `maxHeightVh`,
`minWidth`, index/status column widths, the column list (label, width,
visibility) and the search debounce. Column widths are **proportions**: each
column gets its share of the table (`toPercentWidths`), so the preview fits the
section at any width. `minWidth` (680 px) is only a readability floor, below
which the table scrolls inside its frame. Every visible column needs a width. It is parsed and validated once when the
module loads; a bad value fails start-up (and `npm test`) with the file and key
in the error.

## Quick reference

| Question | Answer |
| --- | --- |
| Which API does this page call? | `POST /api/uploaddata`, plus the lookup `GET`s for validation |
| What is persisted? | Nothing |
| Where are the rules? | `uploadDataValidation.ts` |
| Where is an edit applied? | `applyCellEdits` in `uploadDataDocument.ts` |
| Which file is uploaded? | The original when unchanged, otherwise the serialized working document |
| Where do I change columns or row height? | `config.yaml` |

## Manual test checklist

1. Pick a Raw Litho export with Browse Files, then drag another onto the zone → the zone highlights while dragging, and the dropped file replaces the first; nothing is uploaded.
1a. Drop two files, or a `.txt` file → a clear error; the loaded dataset stays.
1b. Drop a file beside the zone → the browser does not open it.
1c. At ~1024 px window width → no horizontal scrollbar on the page or the preview.
2. Pick malformed JSON or an array root → inline error, Import Data disabled.
3. Scroll a 100,000-record file → scrolling stays smooth; edit a cell, scroll away and back → the edit is still there.
4. Type `Fine  grained sandstone ` in a comment → every space stays.
5. Tab / Shift + Tab through a record and across into the next one.
6. Ctrl + click several cells, paste one value → all change; copy them and paste into Excel → positions are kept.
7. Paste a block copied from Excel onto a cell → values land in the right columns.
8. Enter `abc` in a depth or invert a range → the cell turns red, the record counts as invalid, Import Data refuses with a message.
9. Search and filter by status → the count updates; a record being fixed stays visible.
10. Import unchanged → the original file is sent; edit then import → the edited JSON is sent (check the request payload).
11. Start an import and press Cancel → the request aborts and the page resets.
