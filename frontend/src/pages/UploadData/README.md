# Upload Data page

Route: `/upload-data`

## Purpose

Loads a Raw Litho JSON export, lets the user review and correct every record in
an editable, virtualized table, validates the result, and uploads it to
`POST /api/uploaddata`. The loaded file and every edit are kept in IndexedDB,
so they survive navigating to another page and a browser refresh; they are
cleared by **Cancel**, choosing another file, or a confirmed successful upload.
See *Draft persistence* below.

## Draft persistence

```text
mount        → readUploadDataDraft()          nothing saved or deleted before this finishes
  draft found, no file picked meanwhile → restore file name/size, document, Edited flag
file loaded  → write at once
cell edited  → write after draft.saveDebounceMs (config.yaml), not per keystroke
leave page   → pending write flushed on unmount and on `pagehide` (refresh / close)
Cancel       → abort request, reset page, delete draft
upload ok    → reset page, delete draft, success message
upload fails → draft and edits kept; retry with Import Data
```

- Storage: `services/IndexDB/uploadDataDraftDb.ts` — its own `upload-data-db`
  database, independent of Raw Litho's `raw-litho-db`.
- Logic: `useUploadDataDraft.ts`. The whole working document is one write; edits
  only copy changed rows (`applyCellEdits`), and the document object is stored
  without re-serialising it to JSON.
- Restored: file name and size, Project / Campaign / Drillhole / Created By and
  every other key (they live in the document), record order and ids, edits, and
  the Edited flag. Validation is recalculated; Imported By comes from the
  current trusted identity, never from the draft.
- Upload of a restored draft: the original `File` object is gone, so the upload
  is built from the latest working document under the original file name.
- A failed save shows "Draft not saved" under the preview heading and is retried
  with the next change; the working copy in memory is unaffected.

## Folder tree

```text
UploadData/
├── config.yaml              title, table sizes, columns, search and draft debounce
├── config.ts                typed, validated copy of config.yaml
├── DatasetSummary.tsx       2. Dataset Information
├── README.md                this file
├── UploadData.tsx           page container: file, working document, upload
├── UploadDataTable.tsx      3. Editable JSON Preview (virtualized)
├── uploadDataDocument.ts    the working document and its edit function
├── uploadDataStyles.ts      Tailwind class lists shared by the sections
├── uploadDataValidation.ts  pure validation of the working document
├── useUploadDataDraft.ts    IndexedDB draft: restore, debounced save, clear
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
- **Loaded state:** once a file has parsed, the zone turns green and shows
  "✓ JSON File Loaded", the file name, the record count and **Change File**.
  Change File opens the same picker, and dropping a file onto the zone still
  replaces it. An unreadable file returns the zone to its empty look with the
  error. **Cancel** restores the empty "Drag and drop" look. The zone is in the
  loaded state exactly when `selectedFile` is set, which happens only after a
  successful parse.

### Created By and Imported By

These are two different people, and neither is ever guessed:

| Field | Source | When missing |
| --- | --- | --- |
| Created By | `created_by` in the selected JSON file (written by Raw Litho) | `Unavailable` — e.g. an older file |
| Imported By | the signed-in Windows user from `useCurrentUser()` | `Unavailable` |

**Imported By shows `Unavailable` until the backend provides the identity.**

**How the name is obtained.** A browser cannot read the Windows login, so
`getCurrentWindowsUser()` asks the backend. It calls the endpoint named by
`VITE_CURRENT_USER_PATH` (for example `/api/currentuser`) with
`credentials: "include"` and expects `{ "userName": "DOMAIN\\username" }`.

The answer is fetched once per page load. An error status, a malformed body or
a network failure gives `null`. The hostname, user agent or anything typed in
are never used.

**Today `VITE_CURRENT_USER_PATH` is empty.** The backend has no authentication
(nothing in `Program.cs` or `web.config`) and no current-user endpoint, so no
request is made and the result is `null`.

To enable the name, the backend needs:
1. Windows Authentication: IIS `windowsAuthentication`, or `AddNegotiate()`
   plus `UseAuthentication()`.
2. An authenticated endpoint returning `HttpContext.User.Identity.Name` as
   `{ "userName": ... }`.

Then set `VITE_CURRENT_USER_PATH` (see `.env.example`) and rebuild. No frontend
code changes are needed.

**No `imported_by` in the uploaded file.** Uploading never changes
`created_by`, and `imported_by` is not added to the JSON. The backend contract
(`UploadDataRequest`) has no such field: the server would silently drop it, so
the file would look as if it recorded the importer when nothing was stored. The
importer should be recorded by the server, from its authenticated request, once
Windows Authentication is enabled. Unknown fields such as `created_by` are
ignored by the server, so they never break an upload.

## Scrolling

The page has exactly two vertical scroll areas:

1. **The page:** `main > section`, which takes the full height. It scrolls File
   Selection, Dataset Information, the preview, the Validation Summary and the
   actions.
2. **The preview table:** its frame, as tall as its rows up to `maxHeightVh`.
   It scrolls the records under a sticky header.

The document itself never scrolls; `main` is `h-screen overflow-hidden`.

There used to be a third scrollbar, on the whole document. The preview's
status cells contain `sr-only` screen-reader text, which is
`position: absolute`. With no positioned ancestor, its containing block was the
page, so it escaped every `overflow` box and stretched the document below the
content. The shared table frame (`TABLE_FRAME`) is now `relative`, so that
text stays inside the frame's own scroll area. Nothing is hidden with CSS.

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
  unchanged → the original file (picked in this visit)
  edited or restored → new File(JSON.stringify(workingDocument, null, 2), same name)
  POST /api/uploaddata   multipart/form-data, field "file"
    ok    → reset the page, delete the draft, success message (only after the server confirms)
    error → server message; the draft and edits are kept for a retry
    abort → ignored
```

The request carries an `AbortController` signal; a second click cannot submit
twice, and **Cancel** aborts an in-flight upload, clears the page and deletes the draft. File reads
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
| What is persisted? | The working document (IndexedDB `upload-data-db`) until Cancel or a successful upload |
| Where are the rules? | `uploadDataValidation.ts` |
| Where is an edit applied? | `applyCellEdits` in `uploadDataDocument.ts` |
| Which file is uploaded? | The original when unchanged, otherwise the serialized working document |
| Where do I change columns or row height? | `config.yaml` |

## Manual test checklist

1. Pick a Raw Litho export with Browse Files → the zone turns green with "JSON File Loaded", the file name and record count; drag another onto the zone → it highlights, then shows the new file; nothing is uploaded. Change File opens the picker; Cancel restores the empty zone.
1d. Scroll the page to the bottom → only the page and the preview table have scrollbars; there is no outer document scrollbar and no blank space below the actions.
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
12. Load a file, edit a cell, open another page and come back → file name, record count, metadata and the edit are restored; refresh the browser → the same.
13. Import a restored draft → the edited JSON is sent under the original file name; on success the page resets and the draft is gone (reload shows the empty zone).
14. Stop the backend and import → the error shows; reload → the draft and edits are still there.
