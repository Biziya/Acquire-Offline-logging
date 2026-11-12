# Raw Litho page

Route: `/raw-litho`. Component: `RawLitho.tsx`.

Raw Litho is where a geologist logs raw lithology intervals for a drillhole. You
pick a drillhole, then fill in one table row per depth interval. Everything you
type is kept in the browser (IndexedDB) on this PC, and Save JSON downloads the
finished file. The page never writes rows to the backend. Its API calls are
read-only: `/api/drillholes` and `/api/table-constants` for the dropdown lists.

## Files

```text
RawLitho/
  RawLitho.tsx                    page container, Save JSON, dialogs, toasts
  RawLithoFilters.tsx             drillhole search, Project and Campaign
  RawLithoTable.tsx               table, row buttons, paging, copy and paste
  RawLithoRow.tsx                 one editable row and its cell highlights
  LookupAutocomplete.tsx          dropdown cell (also used by Upload Data)
  config.yaml / config.ts         title, rows per page, row height, columns
  constants.ts                    visible columns, required fields, toasts
  drillholeOrdering.ts            order of the drillhole list
  rawLithoValidation.ts           validation and conditional rules (pure)
  rawLithoSorting.ts              row order by Litho From (pure)
  rawLithoDocumentOperations.ts   edit, add, remove, paste on a document
  rawLithoHelpers.ts              normalising, import parsing, JSON export
  rawLithoImportService.ts        checks an import before anything is written
  rawLithoClipboard.ts            copy text and paste planning
  tableNavigation.ts              arrow, Tab and Delete handling
  hooks/
    useRawLithoWorkspace.ts       the open document, add/remove/edit rows
    useRawLithoDraftPersistence.ts  load, autosave and retry
    useRawLithoImport.ts          two-step JSON import
    useRawLithoLookups.ts         dropdown lists, cache first
    useDrillholes.ts              drillhole list and selection history
    useWorkingDrillholes.ts       which drillholes have saved data
    useRawLithoShortcuts.ts       F4, F5, PageUp, PageDown
    useRawLithoRowFocus.ts        keeps the caret on the right row
    useRemoveRowConfirmation.ts   Remove last row confirmation
```

## Logging a drillhole

### Choosing a drillhole

Type in the Drillhole field or open its list. Until you pick one, the table is
disabled. Project and Campaign come from the selected drillhole and are
read-only.

With the field empty, the list starts with "Recently worked on" (up to three
drillholes with saved data on this PC, most recent first), then "All
drillholes", newest first. A drillhole counts as worked on only when its draft
holds at least one value, so just selecting a hole does not add it. A fourth
working drillhole moves down to "All drillholes". Once you type, the headings
go away and drillholes are ranked by match (exact, prefix, substring, up to 10).

`/api/drillholes` has no date, so "newest first" is the API order reversed
(`sortDrillholesByNewestFirst()` in `drillholeOrdering.ts`). Switching
drillholes saves pending edits first, and the table stays disabled until the
new draft has loaded.

### Adding and removing rows

Add a row with the Add row button, `F4`, `Tab` from the last cell of the last
row, or `↓` on the last row. All four go through `tryAddRow()` in
`useRawLithoWorkspace.ts`, so they validate and behave the same way. A new row
is only created when the current last row is valid (see "Data rules" below). If
it is not, no row is added, a warning toast appears, and the caret moves to the
cell that needs fixing, switching page first if needed.

A new row takes Litho From from the previous row's Litho To and copies
`lithoCode`, `colorCode`, `redoxCode` and `ox` (`ROW_COPY_FIELD_KEYS` in
`constants.ts`). Everything else starts empty. `createRowFromPrevious()` builds
it on top of `createSchemaRow()` from `src/types/rawLithoSchema.ts`. Litho To
starts empty, so holding a key down cannot create a run of blank rows.

Remove last row (button or `F5`) always asks first with a "Remove last row?"
dialog. Focus starts on Cancel, so Enter cannot delete a row by reflex. Cancel
or Escape changes nothing. Remove deletes the row, waits for the IndexedDB
write, then shows "Row removed". The table always keeps one row, so with a
single row the button is disabled and F5 does nothing.

### Row order

Rows are always shown and stored in Litho From order, whatever order you typed
them in. `sortRowsByLithoFrom()` in `rawLithoSorting.ts` is the only sorting
code. It compares numbers (2, 10, 100), uses Litho To as a tie-breaker, and puts
rows with an empty or non-numeric Litho From at the bottom.

Sorting waits until a depth is committed: on blur, on Enter, after adding a
row, on paste, on import and on restore. It never runs while you type, so a row
does not jump out from under the caret. Whole rows move together, and the caret
follows its row by id, even across pages.

### Paging

The table shows 50 rows per page (`table.rowsPerPage` in `config.yaml`,
exported as `RAW_LITHO_ROWS_PER_PAGE`). Use Previous and Next under the table,
or `PageUp` and `PageDown`. Paging only slices the sorted rows for display, so
edits on other pages are kept. Adding a row jumps to the page that holds it. The
current page is remembered and restored when you come back.

### Save JSON

Save JSON, at the bottom right, first checks every lookup code against its list
and every row against the conditional rules. If either fails it stops with a
warning (for a rule, one that names the row, such as "Row 4: CA is required for
this Litho code."). Then it updates `modified_at`, writes the draft to
IndexedDB, and downloads `<drillhole>.json`. If the write fails, the download
still runs and the draft stays queued for retry.

### Import JSON

Import JSON only works when no drillhole is selected, so an import cannot
replace the hole you are editing by accident.

First, `prepareRawLithoImport()` in `rawLithoImportService.ts` checks the file
without writing anything. It is rejected ("Couldn't import the file") if it is
not a readable JSON object, lacks any of `project`, `campaign`, `drillhole`,
`created_at`, `modified_at` or `rows`, has a non-array `rows` or a row that is
not an object, has an empty `drillhole`, has a `created_by` or `edited_by` that
is not text, or holds a lookup code missing from the loaded lists (lists that
failed to load are skipped).

A valid file opens the "Import this JSON file?" dialog with the drillhole and
row count, plus a warning if that drillhole already has saved data. Import
writes the file through `rawLithoSaveQueue.commitImport`, shows "File
imported", then opens the drillhole through `handleDrillholeChange` in
`RawLitho.tsx`, the same as selecting it. Row fields become strings, unknown
keys are dropped, bad row ids are replaced, and rows are sorted by Litho From.

## Data rules

### Columns

`src/types/rawLithoSchema.ts` defines all 20 stored fields. `config.yaml`
decides which are shown, in what order, with what label and width. Widths are
proportions, so the table fits the page; below `table.minWidth` (760 px) it
scrolls inside its frame. Six fields are hidden with `visible: false` and kept
for later use: `extractionType`, `corePass`, `recoveryStart`, `recoveryEnd`,
`coreEnd` and `lithologicalDescription`. They still exist in state, JSON and
IndexedDB, so do not delete them. Visible columns, after the `Ins` row number:

| Column | Field | Input | Required | List source |
| --- | --- | --- | --- | --- |
| Litho From (m) | `lithoFrom` | number | yes | |
| Litho To (m) | `lithoTo` | number | yes | |
| Litho Code | `lithoCode` | lookup | yes | `lithoCode` |
| Color Code | `colorCode` | lookup | yes | `colourCode` |
| CA | `ca` | lookup | | `caCode` |
| OM | `om` | lookup | | `omCode` |
| OM Facies | `omFacies` | lookup | | `omFaciesCode` |
| PY | `py` | lookup | | `pyCode` |
| OX | `ox` | lookup | | `oxCode` |
| Sedim | `sedim` | lookup | | `sedimCode` |
| Redox Code | `redoxCode` | lookup | yes | `redoxCode` |
| Lithology Comments | `lithologyComments` | text | | |
| Granulo | `granulo` | lookup | | digits 0 to 9, local |
| Hardness | `hardness` | lookup | | digits 0 to 9, local |

The list source is the key in the `/api/table-constants` response (see
`src/services/rawLithoLookupConfig.ts`).

### Required fields

The required fields are `lithoFrom`, `lithoTo`, `lithoCode`, `colorCode` and
`redoxCode` (`REQUIRED_COLUMN_KEY_LIST` in `constants.ts`). Required headers
show a red `*`, and an empty required cell is filled pink. "Empty" has one
definition, `hasValue()` in `rawLithoValidation.ts`: `"0"` counts as a value,
while blank or whitespace-only text is empty.

### Checks before a new row

`findRowIssue()` in `rawLithoValidation.ts` checks the last row in this order
and stops at the first problem:

| Order | Problem | Caret goes to |
| --- | --- | --- |
| 1 | a required field is empty | the first empty required field |
| 2 | a depth is not a number, or From is greater than To | Litho To |
| 3 | the same From and To pair already exists | Litho To |

Committing a depth that makes From greater than To puts the previous depth back.

### Duplicate intervals

Two rows may not share the same Litho From and Litho To. The comparison is
numeric, so `120` and `120.0` match. Half-typed intervals are never duplicates,
and overlapping intervals are allowed. Both rows of a pair get orange depth
cells (`findDuplicateIntervalRowIds()`) until one of them changes.

### Conditional rules

Four rules decide which attribute a row needs, or must leave empty, based on its
Litho and Redox codes. They live in `findConditionalRuleIssues()` in
`rawLithoValidation.ts` (codes in `CONDITIONAL_RULE_CODES`), and Upload Data
uses the same function.

| Rule | When | Then |
| --- | --- | --- |
| 1 | OM has a value, or Litho is `01M` `24M` `46M` `0-L` `26L` `L--` | OM Facies is required |
| 2 | Litho is `0-C` `26C` `CA-` | CA is required |
| 3 | Redox is `O` `Y` `lY` `lGrB` `GnRd` `BrGn` | OX is required |
| 4 | Redox is `Bl` `dGn` `Gr` `WGr` `GrGn` `GnGr` | OX must be empty |

Codes match exactly (case-sensitive, surrounding spaces ignored). The cell that
must change turns red and its tooltip gives the message. The page never fills
in or clears a value for you. A broken rule does not stop editing or autosave;
it only blocks Save JSON. Upload Data treats it as a blocking error.

### Lookup codes

Each lookup cell only accepts a code from its list. The list opens on focus with
an `Empty` choice first, which stores `""`. Typing filters and ranks matches;
Enter or a mouse click confirms one. Tab and the arrow keys never accept a
highlighted suggestion. Text that matches nothing is flagged "Select a valid
value" when you leave the cell and is not saved over the old value. Pasted and
imported codes match case-insensitively and are stored in the list's own
spelling.

`LookupAutocomplete.tsx` is shared with Upload Data. `isEnabled` turns the
cell on, and the optional `inputData` prop passes `data-*` attributes to the
input. A cell with an empty list shows `No values` and is disabled.

Lithology Comments drops leading spaces (`normalizeFieldValue()` in
`rawLithoHelpers.ts`) and keeps the rest. Codes and depths are trimmed.

## Keyboard

The Shortcuts popup (the "Help and shortcuts" button,
`src/components/KeyboardShortcuts.tsx`) is the source of truth for keys. If you change a handler, update that list too.

| Keys | What it does |
| --- | --- |
| `Tab` / `Shift`+`Tab` | next or previous cell |
| `←` / `→` | cell left or right when the caret is at the edge of the text |
| `↑` / `↓` | row above or below |
| `PgUp` / `PgDn` | previous or next page |
| `Esc` then `Tab` | leave the table |
| `F2` | move through a dropdown list (Up and Down browse, Enter confirms, Esc cancels) |
| `Delete` | clear the cell |
| `Esc` | close a list, clear the cell selection |
| `Ctrl`+click | select several cells |
| `Ctrl`+`C` / `Ctrl`+`V` | copy or paste cells |
| `F4` | add row |
| `Tab` / `↓` from the last cell | add row |
| `F5` | remove last row (asks first) |
| `↑` / `↓`, `Esc` in drillhole search | move through or close the list |

Navigation skips disabled cells, carries on to the next or previous row, and
crosses pages; `Shift`+`Tab` stops at the first cell. A cell focused from the
keyboard has its whole value selected, so one arrow press moves on; click into
the text for normal editing. Enter in a depth cell commits and re-sorts without
leaving the cell.

`F4`, `F5`, `PageUp` and `PageDown` only work while Raw Litho is open
(`useRawLithoShortcuts.ts`), and any modifier lets the key through, so
`Ctrl`+`F5` still reloads. A plain `F5` never refreshes the page, so it cannot
lose edits waiting for autosave. While a dialog is open or Save runs, `F4` and
paging are ignored.

### Copy and paste

`Ctrl`+click toggles cells into a selection, anywhere in the table. A plain
click elsewhere or `Esc` clears it. Copy writes tab-separated text for the
rectangle around the selection, with unselected cells left blank. Paste takes
tab and newline separated text, such as a block from Excel. A single cell
receives the block at its top-left corner, one value fills every selected
cell, a selection of the same shape maps cell for cell, and any other shape is
rejected.

A paste is all or nothing. It is rejected, and no cell changes, if it runs past
the last row or column (paste never adds rows), touches a disabled cell, puts
text in a depth or an unknown code in a lookup, empties a required field, or
creates an inverted or duplicate interval. Planning is in `planPaste()`
(`rawLithoClipboard.ts`); the edit is applied by `applyCellEdits()`
(`rawLithoDocumentOperations.ts`).

## Where the data is stored

Everything is stored in the browser's IndexedDB on this PC, in the database
`raw-litho-db` (version 4, opened through
`src/services/IndexDB/rawLithoDatabase.ts`):

| Store | Key | Holds |
| --- | --- | --- |
| `drafts` | drillhole id | that drillhole's document, rows in Litho From order |
| `session` | `active-raw-litho-session` | the open drillhole and page |
| `session` | `recent-drillholes` | selection history, most recent first |
| `drillholeCache` | `all-drillholes` | last drillhole list from the server |

Dropdown lists are cached in a separate database, `raw-litho-lookup-cache-db`.
The cached copy shows at once and the server copy replaces it; if the server is
down, the cache stays. The `Ins` number is not stored; it is the row position.

### Autosave and loading

Each edit is written about 400 ms after you stop typing. The save queue
(`src/services/IndexDB/rawLithoSaveQueue.ts`) writes one drillhole at a time
and keeps a failed snapshot for retry. The page retries every 2 seconds and
also flushes when the browser comes back online, the tab is hidden or closed,
you leave the page, or you switch drillholes. Flushing on close is best effort,
and two browser tabs on the same drillhole do not coordinate.

If a draft cannot be read, editing stays disabled and nothing is written over
it. Loading retries every 2 seconds, or at once when you select the drillhole
again. Coming back to the page restores the last drillhole and page.

### Who created and edited it

The document can carry `created_by` and `edited_by`, the Windows user from
`useCurrentUser()`. `created_by` is set once, when a new blank document is first saved. `edited_by`
is set in `commitDocument` on every committed change (edits, pastes, added or
removed rows, Save JSON). Selecting, restoring and paging do not change it.
With no known user, neither field is guessed. Older files without them load as
before, and the backend ignores both on upload.

## Toast messages

All messages live in `TOAST_NOTIFICATIONS` in `constants.ts` and are shown with
`showToast(TOAST_NOTIFICATIONS.<key>)` from `src/hooks/useToast.ts`. Only one
toast shows at a time. How long it stays depends on its type
(`src/config/ui.yaml`: error 5000 ms, the others 3000 ms).

| Key | Message | Type |
| --- | --- | --- |
| `rowAdded` | Row added | success |
| `rowRemoved` | Row removed | success |
| `saveSuccess` | Saved. The JSON file is in your downloads. | success |
| `saveFailed` | Couldn't save. Your edits are still here, so try Save JSON again. | error |
| `actionFailed` | Couldn't remove the row. Try again. | error |
| `importSuccess` | File imported | success |
| `importFailed` | Couldn't import the file | error |
| `importCancelled` | Import cancelled | info |
| `cachedDrillholesLoaded` | Server is offline. Showing the drillhole list saved on this PC. | info |
| `drillholeCacheFailed` | Couldn't keep a copy of the drillhole list for offline use | warning |
| `draftSaveFailed` | Couldn't save your last edit on this PC. Keep this page open and try again. | error |
| `draftLoadFailed` | Couldn't load the saved rows for this drillhole. Reload the page to try again. | error |
| `missingRequiredFields` | Fill in the required (*) cells of the last row first | warning |
| `duplicateInterval` | This From / To interval is already in the table | warning |
| `invalidDepthRange` | From must be less than To. The previous depth was kept. | warning |
| `invalidLookupValue` | Some codes aren't in their list. Fix them, then save. | warning |
| `cellsCopied` | Cells copied | info |
| `invalidPasteValue` | Some pasted values don't fit these columns. Nothing was pasted. | warning |
| `pasteShapeMismatch` | The copied cells don't match the selected cells. Nothing was pasted. | warning |
| `pasteOutOfRange` | The copied cells don't fit in the table. Nothing was pasted. | warning |
| `pasteNotEditable` | These cells can't be edited. Nothing was pasted. | warning |
| `clipboardUnavailable` | Couldn't use the clipboard. Allow clipboard access in the browser and try again. | error |

The conditional-rule warning on Save is built in `RawLitho.tsx` from
`CONDITIONAL_RULE_MESSAGES`. Confirmations use `src/components/ConfirmDialog.tsx`
(props `title`, `message`, `facts`, `confirmLabel`, `cancelLabel`, `busyLabel`,
`isBusy`, `initialFocus`, `tone`).

## FAQ

| Question | Answer |
| --- | --- |
| Why doesn't my row move while I type a depth? | Sorting waits until you leave the cell or press Enter. |
| Why can't I add a row? | The last row is missing a required value, has From above To, or repeats an interval. The caret is on the cell to fix. |
| Why does Save JSON refuse? | A lookup code is not in its list, or a row breaks a conditional rule. |
| Why is Import JSON greyed out? | A drillhole is selected. Clear the Drillhole field first. |
| Is my data still there after a reload? | Yes, in IndexedDB on this PC. It reaches another PC only as an exported JSON file. |
| Does this page send rows to the server? | No. Uploading happens on the Upload Data page. |

## Where to change things

| To change | Look in |
| --- | --- |
| rows per page, column order, labels, widths, hidden columns | `config.yaml` |
| the stored fields and their defaults | `src/types/rawLithoSchema.ts` (`columnByKey`, `createSchemaRow`, `DEPTH_FIELDS`) |
| required fields | `REQUIRED_COLUMN_KEY_LIST` in `constants.ts` |
| fields copied to a new row | `ROW_COPY_FIELD_KEYS` in `constants.ts` |
| conditional rule codes and messages | `CONDITIONAL_RULE_CODES`, `CONDITIONAL_RULE_MESSAGES` in `rawLithoValidation.ts` |
| validation order | `findRowIssue()` in `rawLithoValidation.ts` |
| toast text | `TOAST_NOTIFICATIONS` in `constants.ts` |
| toast durations | `src/config/ui.yaml` |
| row sorting | `sortRowsByLithoFrom()` in `rawLithoSorting.ts` |
| drillhole list order, recent limit | `drillholeOrdering.ts` |
| shortcuts | `hooks/useRawLithoShortcuts.ts`, and the list in `src/components/KeyboardShortcuts.tsx` |
| cell navigation | `tableNavigation.ts`, page crossing in `RawLithoTable.tsx` |
| copy and paste | `rawLithoClipboard.ts`, handlers in `RawLithoTable.tsx` |
| dropdown behaviour | `LookupAutocomplete.tsx` (affects Upload Data too) |
| dropdown sources | `src/services/rawLithoLookupConfig.ts` |
| autosave timing | `SAVE_DELAY` and `RETRY_DELAY` in `hooks/useRawLithoDraftPersistence.ts` |
| table cell styles | `CELL_INPUT`, `REQUIRED_MARK` in `src/components/dataTableStyles.ts` |
| import checks and dialog text | `rawLithoImportService.ts`, `readRawLithoImport()` in `rawLithoHelpers.ts` |
