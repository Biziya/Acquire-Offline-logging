# Upload Data page

Route: `/upload-data`

## Purpose

The page loads a Raw Litho JSON export, shows every record in an editable
table, validates the data and uploads it to `POST /api/upload-data`. The file
and all edits are saved in IndexedDB, so they survive leaving the page and a
browser refresh. Cancel or choosing another file clears them. A successful
upload clears nothing, so the data stays on screen for checking or a corrected
re-upload.

## Files

```text
UploadData/
├── config.yaml              title, overscan, maxHeightVh, statusColumnWidth, search and draft debounce
├── config.ts                typed, validated copy of config.yaml
├── UploadData.tsx           page container: file, working document, upload, dialogs
├── UploadFileSection.tsx    1. File
├── DatasetSummary.tsx       2. Dataset
├── UploadDataTable.tsx      3. Records (virtualized, editable)
├── ValidationSummary.tsx    4. Validation summary
├── uploadDataDocument.ts    the working document and applyCellEdits
├── uploadDataValidation.ts  pure validation of the working document
├── uploadDataStyles.ts      Tailwind class lists shared by the sections
├── useUploadDataDraft.ts    IndexedDB draft: restore, debounced save, clear
└── README.md
```

The confirmation dialogs use the shared `src/components/ConfirmDialog.tsx`.

## Page layout

Four numbered sections (File, Dataset, Records, Validation summary) sit in a
one-column grid (`grid-cols-[minmax(0,1fr)]`), followed by Cancel and Upload
to database. On extra wide screens File and Dataset sit side by side. A table
wider than the page scrolls inside its own frame, so the page never scrolls
sideways. The title stays outside the scroll area, and the only vertical
scrollbars are the page body and the table frame.

## Choosing a file

Choose file and a drop onto the zone both call `handleFileSelect` in
`UploadData.tsx`, which holds the only type check and JSON parse.

- While a file is dragged over the zone it highlights and reads "Drop the file
  here".
- Dropping several files shows "Drop one file at a time". A file that is not
  `.json` or `application/json` shows "Choose a .json file". In both cases the
  loaded dataset and its edits stay.
- Malformed JSON, or a JSON root that is not an object, shows "This file isn't
  valid JSON. Check the file and try again."
- A valid file replaces the current dataset. Nothing is uploaded until the
  upload is confirmed.
- A window-level listener stops the browser from opening a file dropped beside
  the zone.
- Picking the same file twice works, because the input is cleared after every
  pick.

Once a file is parsed the zone shows "File loaded", the file name with an x
button (Remove selected file), the record count and "Choose another file".
The x button asks first, like Cancel (see *Cancel and remove*), and is
disabled during an upload.

## Created By, Edited By and Imported By

These can be three different people. None of them is ever guessed; a missing
value shows `—`.

| Field | Source |
| --- | --- |
| Created By | `created_by` in the file (written by Raw Litho). This page never changes it. |
| Edited By | `edited_by` in the file. An edit on this page sets it to the current user; with no verified user the file's value stays. |
| Imported By | The signed-in Windows user from `useCurrentUser()`. Display only, never written into the JSON. |

The identity comes from `GET /api/status?includeUser=true` (see
`currentUser.ts` in `src/services/README.md`).

The uploader recorded in the database comes from the backend, not from the
file. Right before each upload the page verifies the Windows user again with
`getVerifiedWindowsIdentity(true)`. Without a verified user nothing is sent.
The verified `DOMAIN\user` goes along as `expectedUser`, which the backend only
compares with the account the request authenticated as (409 when they
differ). The backend README covers the rest under *Uploader identity*.

## The working document

`handleFileSelect` parses the file once into the working document; the
selected `File` is never modified. `applyCellEdits` in `uploadDataDocument.ts`
returns the next document and copies only the rows that change. Every key of the document and of each row
is kept, including hidden columns and unknown fields. A depth stored as a JSON
number stays a number when the new text is numeric, and comment text keeps
its spaces. Values that are JSON objects or lists are shown read-only.

The table reads every value from the working document on render, so an edit
survives its row scrolling out of view and back.

## The records table

The table uses Raw Litho's columns, labels, widths, `rowHeight` (26 px),
`minWidth` and `indexColumnWidth` from `RawLitho/config.yaml`, so both tables
always match. The header starts with "Ins" (the record number), then Status,
then the data columns. Required columns show a red `*`. Status shows a tick,
`!` or a cross, with the messages as a tooltip.

- Only the rows in view plus `overscan` are rendered (`@tanstack/react-virtual`),
  so 100,000 records stay responsive.
- The frame grows with the records up to `maxHeightVh` percent of the window,
  then scrolls under a sticky header.
- Search covers the visible columns after `search.debounceMs`. The Show filter
  picks all, invalid, warning or valid records. A record edited while a filter
  is active stays listed until the filter changes.
- Tab and Shift+Tab move to the next or previous cell and wrap across records.
  Left and right arrows do the same at the edge of the text. Up, Down and Enter
  move within the column. A cell outside the rendered rows is scrolled into
  view and then focused.
- Ctrl (or Cmd) + click toggles a cell in the selection. A plain click outside
  the selection clears it, and so does Escape.
- Ctrl+C with a selection copies its bounding rectangle as tab-separated text.
- Pasting one value with a selection fills every selected cell. A block from
  Excel is pasted with its top-left corner on the focused cell and is refused
  if it runs past the table. Read-only cells are skipped and counted in the
  notice below the table.

### Lookup cells

Lookup cells use Raw Litho's `LookupAutocomplete`, so they behave the same on
both pages:

- a dropdown arrow, and the list opens on focus with an Empty option first;
- typed text is a draft until Enter or a click picks a value;
- F2 then the arrow keys browse the list, and Escape reverts;
- a value that is not in the list shows a "Select a valid value" badge.

Granulo and Hardness use local lists (digits 0 to 9). The other lookups come
from `GET /api/table-constants`, fetched directly for this page rather than
read from Raw Litho's offline lookup cache. If a list cannot load (for example
the server is offline), its cells are disabled, as in Raw Litho, and the
validation reports "Lookup codes not checked."

## Validation

`validateUploadDocument` is pure. It runs on a deferred copy of the document
so typing stays responsive, and Upload to database validates the latest
document again.

| Severity | Checks |
| --- | --- |
| error (blocks upload) | missing project or drillhole; `rows` missing or empty; a row that is not an object; an id that is not a whole number; empty or non-numeric depth; a non-text value in a text field; an invalid timestamp; Litho From not less than Litho To; duplicate interval; unknown lookup code (when the list loaded); a broken conditional rule (Raw Litho README, *Conditional rules*) |
| warning | required field empty; campaign or timestamp missing; lookup codes still loading or not checked |

## Saving the draft

When the page opens it reads the saved draft, and saves or deletes nothing
until that read finishes. The draft is restored only if no file was picked in
the meantime. A loaded file is saved at once, edits after
`draft.saveDebounceMs`, and a pending save is flushed on unmount and on
`pagehide`. Cancel deletes the draft; an upload, successful or not, keeps it.

The draft lives in its own IndexedDB database, `upload-data-db`
(`services/IndexDB/uploadDataDraftDb.ts`), separate from Raw Litho's. It holds
the file name and size, the working document (with Project, Created By, Edited
By and every other key), the edits and the Edited flag. Validation runs again
after a restore, and Imported By comes from the current user. A restored draft
no longer has its original `File`, so its upload is built from the working
document under the original file name. If a save fails, "Draft not saved"
appears under the Records heading and the next change tries again.

## Uploading

```text
Upload to database → validate the latest document
                     errors: warning toast, "N records have errors. Fix them before uploading."
                   → "Upload to database?" dialog, Cancel focused first
Upload             → verify the Windows user, then POST /api/upload-data
                     unchanged file picked this visit: the original file
                     edited or restored: the working document as JSON, same file name
```

The dialog lists Records, Project, Drillhole and Version (Edited or Original
file). The upload is `multipart/form-data` with `file` and `expectedUser`, and
the page gives up after 180 s. An `AbortController` makes sure a second click
cannot send twice.

Toasts:

| Outcome | Toast |
| --- | --- |
| 200 | the backend's message ("Data uploaded successfully."), or "Upload complete" |
| no verified Windows user | "Couldn't confirm your Windows sign-in, so nothing was uploaded. Check that the server is online." |
| 401 | "Couldn't confirm your Windows sign-in." |
| 400, 403, 409, 413, 500 | the backend's `message`, plus the first row error for 400 |
| timeout | "Upload timed out" |
| server unreachable | "Server unavailable" |
| other failure | "Upload failed. Try again." |

After a failure the data and draft stay, so the upload can be retried.

## Cancel and remove

Cancel and the x button on the loaded file both discard the file and every
edit, so they ask first with "Discard this upload?" (Discard or Keep editing).
During an upload the dialog is "Stop the upload?" (Stop upload or Keep
uploading), and confirming aborts the request. With nothing loaded, Cancel
just resets the page.

## Configuration

`config.yaml` holds `title`, `table.overscan`, `table.maxHeightVh`,
`table.statusColumnWidth`, `search.debounceMs` and `draft.saveDebounceMs`.
Columns, widths and row height belong to `RawLitho/config.yaml`. The file is
parsed once when the module loads, and a bad value fails start-up (and
`npm test`) with the file and key in the error.

## Manual test checklist

1. Choose an export, then drag another onto the zone. It replaces the first
   and nothing is uploaded. Two files, a `.txt` file or a drop beside the zone
   leave the loaded data alone.
2. Load malformed JSON. The toast appears and Upload to database stays disabled.
3. Edit a cell in a 100,000-record file, scroll away and back. The edit stays.
4. With the server offline, reload. Lookup cells other than Granulo and
   Hardness are disabled.
5. Type a code that is not in a lookup list and press Tab. "Select a valid
   value" shows.
6. Enter `abc` in a depth. The cell turns red and the upload is refused.
7. Upload an unchanged file, then an edited one. The payload is first the
   original file, then the edited JSON.
8. Edit a cell, leave the page, come back and refresh. The edit is restored.
   Cancel and Discard clear it.
