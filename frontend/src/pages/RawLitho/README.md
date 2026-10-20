# Raw Litho page

Route: `/raw-litho` · Component: `RawLitho.tsx`

## Purpose

Raw Litho is the data-entry page for raw lithology intervals. A geologist picks
a drillhole, then fills in one table row per depth interval. The page is
responsible for:

- loading the drillhole list and the eleven dropdown lookups,
- keeping an editable table of rows in memory and mirrored into IndexedDB,
- keeping the rows ordered by Litho From, whatever order they were entered in,
- enforcing the interval rules before a new row can be created,
- keyboard-first navigation and shortcuts,
- restoring the last drillhole and page after navigating away,
- importing a JSON document (behind a confirmation dialog),
- exporting the current document as a JSON file on Save.

The page never writes rows to the backend. All ten backend endpoints it uses are
read-only.

---

## Folder tree

```text
RawLitho/
├── hooks/
│   ├── useDrillholes.ts            loads /api/drillholes, orders the list
│   ├── useRawLithoImport.ts        two-step JSON import (prepare → confirm)
│   ├── useRawLithoLookups.ts       loads the 9 API lookups, cache-first
│   ├── useRawLithoRowFocus.ts      row-id focus that survives reordering
│   ├── useRawLithoShortcuts.ts     F4 / F5 / PageUp / PageDown
│   ├── useRawLithoDraftPersistence.ts  restore, autosave and recovery
│   ├── useRawLithoWorkspace.ts     the editable document + tryAddRow
│   ├── useRemoveRowConfirmation.ts remove-last-row confirmation flow
│   └── useToast.ts                 single-toast state
├── ConfirmDialog.tsx               shared modal: import + remove confirmations
├── LookupAutocomplete.tsx          one dropdown/autocomplete cell
├── RawLitho.tsx                    page container
├── RawLithoFilters.tsx             drillhole search + Project/Campaign output
├── RawLithoRow.tsx                 one editable table row
├── RawLithoTable.tsx               table, pagination, row action buttons
├── README.md                       this file
├── Toast.tsx                       top-centre notification
├── config.yaml                     title, rows per page, row height, columns
├── config.ts                       typed, validated copy of config.yaml
├── constants.ts                    columns, required keys, toasts, row factory
├── drillholeOrdering.ts            recent-first / newest-first drillhole order
├── rawLithoClipboard.ts            copy text + paste planning for selected cells
├── rawLithoDocumentOperations.ts    storage-free document transformations
├── rawLithoHelpers.ts             document normalisation, import read, export
├── rawLithoImportService.ts        validates an import before touching storage
├── rawLithoSorting.ts              row ordering by Litho From
├── rawLithoStyles.ts               Tailwind class lists shared by components
├── rawLithoValidation.ts           pure validation rules
└── tableNavigation.ts              DOM focus + key-detection utilities
```

---

## File responsibilities

```text
RawLitho.tsx
- page container; composes the four hooks
- derives selectedDrillhole (project/campaign) for the filter bar
- owns isSaving and handleSave (IndexedDB write + JSON export)
- renders Toast, ConfirmDialog, filters, table, Save button

RawLithoTable.tsx
- renders the header, the visible page of rows, pagination and row buttons
- owns the tbody DOM ref and ALL focus movement
- requestAddRow(): the single funnel for Add Row / F4 / Tab / ArrowDown
- handleTableKeyDown(): page crossing for Tab / arrows, Tab and ArrowDown row
  creation
- owns the Ctrl + click cell selection and the copy / paste handlers
- calls useRawLithoShortcuts

RawLithoRow.tsx
- renders one row: a plain input, or a LookupAutocomplete for lookup columns
- tags each <td> with data-column so focus can target a named cell
- applies required, missing-value and duplicate-interval cell classes
- handles Delete-to-clear and arrow navigation for plain inputs

Toast.tsx
- the single toast component; one notification at a time
- renders the icon, accent colour and live-region role for its type
- auto-dismisses after `duration`, fading out over the last 200ms

ConfirmDialog.tsx
- the shared confirmation modal, used by JSON import and Remove Last Row
- title, message, optional details, Cancel + destructive confirm button
- Escape cancels; focus starts on Cancel unless initialFocus="confirm"
- returns focus to whatever opened it when it closes

hooks/useToast.ts
- holds the one active notification: showToast(notification) / hideToast(id)
- each toast gets an incrementing id, used as the React key so a repeated
  message restarts the timer instead of being swallowed

hooks/useRemoveRowConfirmation.ts
- the single Remove Last Row flow shared by the button and F5
- requestRemoveLastRow / cancelRemoveLastRow / confirmRemoveLastRow
- shows "Row removed" only after the write resolves

LookupAutocomplete.tsx
- combobox for the 11 lookup columns; filters, ranks and limits suggestions
- highlights the closest match while typing; ArrowRight / ArrowLeft accept it
  and move to the next / previous cell
- validates on blur: a non-matching value is flagged, not silently kept
- closes sibling dropdowns via a window CustomEvent
- renders the menu in a portal so the table's scroll container cannot clip it
- never takes ArrowUp / ArrowDown: the list is a mouse and mouse-wheel surface

RawLithoFilters.tsx
- drillhole search with ranked suggestions
- renders the list in the order `useDrillholes` supplies; it does not re-sort
- read-only Project and Campaign values

drillholeOrdering.ts
- the single owner of the drillhole selector's order
- orderDrillholes(drillholes, recentHoleIds): 3 most recent, then newest first
- addRecentHoleId(): records a selection, most recent first, capped at 3
- sortDrillholesByNewestFirst(): the one place the newest-first rule lives
- pure; no React, no DOM, no storage

constants.ts
- columns (all 20 fields) and tableColumns (the visible ones, in config.yaml order)
- REQUIRED_COLUMN_KEY_LIST / REQUIRED_COLUMN_KEYS
- ROW_COPY_FIELD_KEYS, RAW_LITHO_ROWS_PER_PAGE, TOAST_NOTIFICATIONS
- createEmptyRow(), createRowFromPrevious()

rawLithoValidation.ts
- pure rules: required fields, depth validity, duplicate intervals, row validity
- findRowIssue() returns the first blocking issue and the cell to focus
- no UI text

rawLithoSorting.ts
- the single sorting helper: sortRowsByLithoFrom(rows)
- isRowOrderSorted(), sortRawLithoDocumentRows() for restore and import
- getPageForRowIndex() / findRowPage() so a row can be located by id
- pure; no React, no DOM

hooks/useRawLithoRowFocus.ts
- keeps the caret on a logical row, addressed by row.id, not by index
- requestFocus() for a row that does not exist in the DOM yet
- focusRowCell() for now, switching page first when the row is off-page
- restores focus dropped by a reorder; leaves deliberate focus moves alone

tableNavigation.ts
- arrow-key cell navigation and Delete-to-clear detection
- moveFocusHorizontally(): an unconditional one-cell move, used by the lookup
  cell once it has accepted a suggestion
- the "key already handled" marker shared by cell and table handlers
- focusCellInRow(tbody, rowId, columnKey) and the row/column lookups it needs
- hasLostFocus(): tells a dropped caret apart from a deliberate move

rawLithoHelpers.ts
- normalizeRawLithoDocument / touchRawLithoDocument (the canonical shape)
- readRawLithoImport (parse + validate a file), exportRawLithoSnapshot
- getNextRowId, isStandardRawLithoDocument (legacy-draft detection)

rawLithoImportService.ts
- prepareRawLithoImport: full validation with zero writes
- applyRawLithoImport: writes only after confirmation
- buildImportConfirmationMessage
```

---

## Table columns

`rawLithoSchema.ts` defines all 20 persisted fields, their keyed column definitions
and defaults. `constants.ts` re-exports `columns`; `tableColumns` controls which are
displayed; it is built from `config.yaml` (order, label, width, compact,
`visible`). Six are intentionally `visible: false` and marked "do not delete" for
future use (`extractionType`, `corePass`, `recoveryStart`, `recoveryEnd`,
`coreEnd`, `lithologicalDescription`). They still exist in state, JSON, and
IndexedDB.

Displayed left to right, with `Ins` (the derived row number) first:

| Column | Field | Input | Required | Source |
| --- | --- | --- | --- | --- |
| Litho From (m) | `lithoFrom` | number | ✅ | — |
| Litho To (m) | `lithoTo` | number | ✅ | — |
| Litho Code | `lithoCode` | lookup | ✅ | `/api/lithocodes` |
| Color Code | `colorCode` | lookup | ✅ | `/api/colour` |
| CA | `ca` | lookup | | `/api/ca` |
| OM | `om` | lookup | | `/api/om` |
| OM Facies | `omFacies` | lookup | | `/api/omfacies` |
| PY | `py` | lookup | | `/api/py` |
| OX | `ox` | lookup | | `/api/ox` |
| Sedim | `sedim` | lookup | | `/api/sedim` |
| Redox Code | `redoxCode` | lookup | ✅ | `/api/redoxcode` |
| Lithology Comments | `lithologyComments` | text | | — |
| Granulo | `granulo` | lookup | | local digits 0–9 |
| Hardness | `hardness` | lookup | | local digits 0–9 |

Required columns show a red `*` in the header. An empty required cell gets the
`raw-litho-cell--missing` class (pink fill and ring) while the page is enabled.

---

## Row ordering

Rows are always displayed and stored in **Litho From ascending** order,
regardless of the order they were typed in.

```text
entered                      shown and stored
10 → 15                      10 → 15
15 → 20        becomes       13 → 15
13 → 15                      15 → 20
```

### The rule

`sortRowsByLithoFrom(rows)` in `rawLithoSorting.ts` is the only sorting code in
the page. Everything else calls it.

| Step | Key | Direction | Notes |
| --- | --- | --- | --- |
| 1 | `lithoFrom` | ascending | Compared as **numbers**: `2`, `10`, `100` — never as text. |
| 2 | `lithoTo` | ascending | Tie-breaker only, used when two rows start at the same depth. Never the primary key. |
| 3 | original position | — | `Array#sort` is stable, so rows that compare equal keep their relative order. Ordering is deterministic; nothing shuffles randomly. |

Rows whose `lithoFrom` is empty — or not a number — sort to the **bottom**, so a
new or half-filled row never pushes a valid interval down:

```text
10 → 15
13 → 15
15 → 20
(empty)      ← stays last
```

An empty `lithoTo` sorts last *within* its own `lithoFrom` group, on the same
principle.

### Whole rows move

The comparator reorders row objects, never individual values. When a row moves,
every field travels with it — Litho Code, Colour Code, Redox, CA, OM, OM Facies,
PY, OX, Sedim, Granulo, Hardness, comments, and the row's `id`. The same object
reference is reused, so nothing can be copied to the wrong row.

### When sorting runs

| Trigger | Where |
| --- | --- |
| Litho From / Litho To committed on **blur** | `commitDepthEdit` |
| Litho From / Litho To committed with **Enter** | `commitDepth` in `RawLithoRow.tsx` → `commitDepthEdit` |
| Moving to another cell (arrow keys, Tab) | the resulting blur |
| Add Row button, **F4**, **Tab**, **ArrowDown** | `tryAddRow` |
| JSON import | `readRawLithoImport` |
| IndexedDB restore | the draft loader |

### Not while typing

Sorting never runs on a keystroke. `updateRow` — the per-character handler —
does not sort, so a row cannot jump out from under the caret mid-edit. The value
has to settle first (blur, Enter, or leaving the cell).

`sortRowsByLithoFrom` returns the **same array reference** when nothing moved.
Callers compare references and skip the state update entirely, so committing a
value that does not change the order costs no re-render, no focus movement and
no IndexedDB write.

### Focus survives reordering

Rows are keyed and addressed by `row.id`, never by array index. Each `<tr>`
carries `data-row-id` and each `<td>` carries `data-column`, so any cell can be
found again after the rows move.

`useRawLithoRowFocus` tracks the cell the user is in (via the table body's
`onFocus`) and, when the row order changes:

1. does nothing if focus is still on a real element — a deliberate move to the
   Save button or another cell is never stolen back;
2. otherwise re-focuses the tracked cell **by row id**, because browsers drop
   focus when a focused element is relocated in the DOM;
3. if that row is now on another page, switches to that page first and focuses
   once it has rendered.

A row that moves across a page boundary therefore takes the caret with it.

### Sorting happens before pagination

The whole dataset is sorted in state; pagination only slices the sorted array
for rendering. Pages are never sorted individually, so a row can never appear
on the wrong page.

```text
all rows  →  sortRowsByLithoFrom  →  slice into pages of 50  →  render one page
```

`tryAddRow` computes the new row's page from its position *after* sorting, so
the view follows a created row wherever it lands.

### The stored order matches the view

The sorted array is what the debounced auto-save writes, so IndexedDB and the
table never disagree. Two extra guarantees:

- **Import** is sorted inside `readRawLithoImport`, before the confirmed
  document is written, so the stored draft and the rendered table come from the
  same array.
- **Restore** sorts the loaded draft, and rewrites it when the stored order was
  stale — `needsDraftRewrite` triggers on a legacy shape *or* on
  `!isRowOrderSorted(rows)`. Reordering on load does not bump `modified_at`;
  it is not a user edit.

### Interaction with validation

Sorting cannot be used to slip past validation. The rules are unchanged and run
on the sorted rows:

- Duplicate `lithoFrom`/`lithoTo` pairs are still rejected, still warn, still
  lock focus, and still block row creation.
- Both rows in a duplicate pair keep their `raw-litho-cell--duplicate`
  highlight after they move.
- `tryAddRow` validates the **last** row, which after sorting is the deepest
  interval — the natural row to continue from, and the row `createRowFromPrevious`
  copies its values from.
- A row whose `lithoFrom` was cleared sinks to the bottom and becomes the row
  `tryAddRow` validates, so it blocks creation until it is fixed. That is
  intended: it is an invalid row.
- An inverted range (`lithoFrom > lithoTo`) is reverted first; the reorder then
  runs on the corrected values.

## Row creation

### Required fields

A new row is created only when **all five** required fields of the current last
row are filled. Whitespace-only counts as empty.

```text
Litho From · Litho To · Litho Code · Color Code · Redox Code
```

`REQUIRED_COLUMN_KEY_LIST` in `constants.ts` is ordered, which is what lets
validation report the *first* missing cell so focus can land on it.

### Validation order

`findRowIssue(row, rows)` in `rawLithoValidation.ts` returns the first blocking
issue, or `null`. Order matters — the depth-range check only runs once both
depth fields are non-empty.

| Order | Issue | Condition | Cell focused | Toast |
| --- | --- | --- | --- | --- |
| 1 | `missingRequiredFields` | any required field empty | first missing field | "Fill Litho From, Litho To, Litho Code, Colour Code and Redox Code before adding a new row." |
| 2 | `invalidDepthRange` | a depth is not finite, or `lithoFrom > lithoTo` | `lithoTo` | "Invalid Litho depth range" |
| 3 | `duplicateInterval` | same `lithoFrom`/`lithoTo` pair exists in another row | `lithoTo` | "This Litho From / Litho To interval already exists. Please change the interval before continuing." |

### Duplicate intervals

The same Litho From / Litho To combination must not appear in two rows:

```text
Existing row:   Litho From = 120   Litho To = 150
Current row:    Litho From = 120   Litho To = 150     ← rejected
```

Details of the rule (`isDuplicateInterval`):

- Comparison is **numeric**, so `120` and `120.0` are the same interval.
- A row is never a duplicate of itself (compared by `row.id`).
- An **incomplete** interval is never a duplicate, so partially typed rows are
  not flagged while the user is still typing.
- Only the exact pair matters. Overlapping but unequal intervals are allowed.

`findDuplicateIntervalRowIds(rows)` returns the ids of **every** row taking part
in a duplicate, so both the original and the copy are highlighted with
`raw-litho-cell--duplicate` (orange fill and ring) on their two depth cells.
Values stay visible and editable.

### Focus locking

When creation is rejected, `requestAddRow` in `RawLithoTable.tsx`:

1. does not create a row,
2. calls `event.preventDefault()` so Tab and ArrowDown cannot move focus out,
3. moves focus to `focusField` **in the row identified by `rowId`**,
4. if that row is on a different page, switches page first and focuses the cell
   once it has rendered.

The user can only advance once the row is valid. Add Row, F4, Tab, and
ArrowDown are all blocked identically.

### Copied values

`createRowFromPrevious(previousRow, id)` in `constants.ts` builds the new row:

| New field | Value |
| --- | --- |
| `lithoFrom` | previous row's `lithoTo` (keeps intervals contiguous) |
| `lithoCode` | copied |
| `colorCode` | copied |
| `redoxCode` | copied |
| `ox` | copied |
| everything else | `""` |

The four copied fields are listed in `ROW_COPY_FIELD_KEYS`. `CA`, `OM`,
`OM Facies`, `PY`, `Sedim`, `Granulo`, `Hardness`, and both comment fields are
**not** copied. This applies to all four creation paths.

```text
Previous row:  From 10  To 15  Litho SS  Color GY  Redox OX  OX 3  CA CA1
                   ↓ Add Row / F4 / Tab / ArrowDown
New row:       From 15  To __  Litho SS  Color GY  Redox OX  OX 3  CA ___
```

Because `lithoTo` starts empty, the newly created row is immediately invalid,
which stops a held-down key from creating a run of blank rows.

The new row is then sorted into position with the rest. Since its `lithoFrom`
continues the deepest row's `lithoTo`, it normally lands at the end — but if a
row with an empty `lithoFrom` is sitting at the bottom, the new row is placed
above it.

### Centralised path

All four routes converge on one function, so validation, warnings, copying, and
persistence cannot drift apart:

```text
Add Row button ─┐
F4             ─┤
Tab            ─┼─▶ RawLithoTable.requestAddRow()   (owns focus)
ArrowDown      ─┘        │
                         ▼
              useRawLithoWorkspace.tryAddRow()      (owns validation + state)
                         │
                         ├─ findRowIssue() → toast + { created: false, rowId, focusField }
                         └─ createRowFromPrevious()
                              → sortRowsByLithoFrom()
                              → commitDocument → stage latest snapshot → debounced IndexedDB write
```

`tryAddRow()` returns `{ created, rowId, focusField }`. It is the only place
that appends a row. `rowId` identifies the new row, or the row that blocked
creation, so the caller moves focus by id rather than by position — positions
change when the rows are reordered.

---

## Notifications

One toast component, one confirmation component, one message catalogue. No
action builds its own notification.

| Piece | Location |
| --- | --- |
| Toast component | `Toast.tsx` (Tailwind; keyframes in `css/index.css`) |
| Toast state | `hooks/useToast.ts` (`showToast` / `hideToast`) |
| Message catalogue | `TOAST_NOTIFICATIONS` in `constants.ts` |
| Confirmation modal | `ConfirmDialog.tsx` |
| Remove confirmation flow | `hooks/useRemoveRowConfirmation.ts` |
| Both rendered by | `RawLitho.tsx` |

### Showing a toast

`showToast` takes an entry from the catalogue rather than a loose string, so
the message, type and duration always travel together:

```js
showToast(TOAST_NOTIFICATIONS.rowAdded);
```

`useToast` keeps **one** notification at a time; a new one replaces the current
one. Each gets an incrementing id used as the React key, so showing the same
message twice restarts the animation and timer instead of looking like nothing
happened.

Messages are 2-5 words. Detail belongs where it can be acted on — the pink
missing-required cells, the orange duplicate cells, or a dialog — not in a
toast.

### Toast types

| Type | Meaning | Icon | Accent |
| --- | --- | --- | --- |
| `success` | the action completed | ✓ | green |
| `warning` | refused, the user can fix it | ! | amber |
| `error` | something failed unexpectedly | ✕ | `--rl-danger` |
| `info` | neutral status, nothing to act on | i | navy |

Colour is never the only signal: each type has its own glyph. `error` and
`warning` render as `role="alert"` with `aria-live="assertive"`; `success` and
`info` as `role="status"` / `polite`.

The toast is a white card with navy text, a coloured accent bar and a matching
icon badge — pinned top-centre, capped at 320px, and it slides down and fades
in over 180ms. It sets `pointer-events: none` so it can never intercept a click
on the table beneath it, and animations collapse to 1ms under
`prefers-reduced-motion`.

### Catalogue

| Key | Message | Type | Raised when |
| --- | --- | --- | --- |
| `rowAdded` | Row added | success | a row was created |
| `rowRemoved` | Row removed | success | the last row was removed and stored |
| `saveSuccess` | Changes saved | success | Save wrote and exported |
| `saveFailed` | Save failed | error | Save's write or export threw |
| `actionFailed` | Action failed | error | a confirmed removal failed to persist |
| `importSuccess` | Import complete | success | an import was applied |
| `importFailed` | Import failed | error | the file was rejected |
| `importCancelled` | Import cancelled | info | the import dialog was cancelled |
| `importNeedsLookupCorrection` | Fix lookup codes | warning | imported rows hold unknown codes |
| `cachedDrillholesLoaded` | Using offline data | info | drillholes came from the cache |
| `drillholeCacheFailed` | Offline cache failed | warning | the drillhole cache write failed |
| `draftSaveFailed` | Changes not saved | error | auto-save failed |
| `draftLoadFailed` | Could not load data | error | the draft could not be read |
| `missingRequiredFields` | Complete required fields | warning | a required cell is empty |
| `duplicateInterval` | Duplicate interval | warning | the interval already exists |
| `invalidDepthRange` | Invalid depth range | warning | Litho From is past Litho To |
| `invalidLookupValue` | Invalid lookup codes | warning | Save blocked by unknown codes, or a paste holds one |
| `cellsCopied` | Cells copied | info | selected cells were copied |
| `invalidPasteValue` | Invalid pasted value | warning | a pasted depth is not a number |
| `pasteShapeMismatch` | Selection does not match clipboard | warning | multi-value paste into a selection of another shape |
| `pasteOutOfRange` | Paste exceeds table | warning | the pasted block runs past the last row or column |
| `pasteNotEditable` | Cells not editable | warning | the pasted block covers a disabled cell |
| `clipboardUnavailable` | Clipboard unavailable | error | the browser refused clipboard access |

`missingRequiredFields`, `duplicateInterval` and `invalidDepthRange` are also
raised by a rejected paste.

### Row added

`tryAddRow` raises `rowAdded` on the success path only — after validation has
passed and the row is in state. All four creation routes go through it, so the
Add Row button, F4, Tab and ArrowDown all report identically and none of them
needs its own toast call.

A rejected attempt shows the matching warning instead
(`missingRequiredFields`, `duplicateInterval`, `invalidDepthRange`) and never a
success toast.

### Removing the last row

Removal always asks first. The button and F5 both call
`requestRemoveLastRow`, so neither can delete anything on its own:

```text
Remove Last Row button ─┐
F5                     ─┴─▶ requestRemoveLastRow()
                                    │
                            confirmation dialog
                            "Remove last row?"
                            "This row will be deleted."
                                    │
              ┌─────────────────────┴─────────────────────┐
           Cancel                                      Remove
              │                                           │
      dialog closes                            removeLastRow()
      table untouched                          → row dropped
      nothing written                          → draft written (awaited)
      no toast                                          │
                                              ┌─────────┴─────────┐
                                          resolved true      resolved false
                                              │                   │
                                        "Row removed"      "Action failed"
                                          (success)            (error)
```

`removeLastRow` in `useRawLithoWorkspace.ts` is `async` and resolves `true`
only once `writeRawLithoDraft` has succeeded, which is what lets the flow
promise that a "Row removed" toast means the change is actually stored. While
the write is in flight the confirm button reads "Removing…" and both buttons
are disabled.

Escape cancels, exactly like the Cancel button. The table always keeps at least
one row: at a single row the button is disabled and F5 does not even open the
dialog.

### Dialog appearance

`ConfirmDialog` is shared, so both confirmations look the same: a 400px white
card, 12px radius, navy title, muted message, layered shadow, on a navy
translucent backdrop, sliding in over 180ms.

The destructive action is unmistakable — Cancel is a neutral white/navy
outline button, Remove is solid `--rl-danger` with a tinted shadow. Both have
hover, active (1px press), and `:focus-visible` states on the shared
`--rl-motion` transition; the Remove button's focus ring is red rather than
navy.

Focus starts on **Cancel** for the removal dialog, so Enter cannot delete a row
by reflex. The import dialog passes `initialFocus="confirm"` and shows a replacement warning
when the target drillhole already has a stored draft. Either way, focus returns to whatever opened the
dialog when it closes.

### Shortcuts are blocked behind a dialog

`RawLitho.tsx` passes
`isBlocked = pendingImport || removal.isConfirmOpen || isSaving` to the table,
which stops F4, PageUp and PageDown while a modal is open. F5 is still
swallowed so it can never refresh the browser.

## Keyboard behaviour

### Shortcuts

Registered by `useRawLithoShortcuts.ts` on a `window` `keydown` listener added
on mount and removed on unmount, so the shortcuts exist **only** while Raw Litho
is the active route.

| Key | Action | Notes |
| --- | --- | --- |
| `F4` | Add Row | Same `tryAddRow` path as the button. Ignored while disabled or blocked. |
| `F5` | Remove Last Row | Opens the confirmation dialog — it never deletes on its own. Browser refresh is always prevented while the page is mounted, so a stray F5 cannot discard edits still inside the auto-save debounce. Does not open the dialog when only one row remains. |
| `PageUp` | previous page | No-op on the first page. |
| `PageDown` | next page | No-op on the last page. |

Any modifier (Alt / Ctrl / Meta / Shift) makes the handler ignore the key, so
`Ctrl`+`F5` still performs a hard refresh.

Shortcuts are suppressed while `isBlocked` is true — during a save, or while
either the import or the remove confirmation dialog is open — except for F5,
which stays swallowed.

### Navigation inside the table

| Key | Behaviour |
| --- | --- |
| `←` / `→` | Move to the previous / next editable cell, but only when the caret is at the edge of the current value, so normal text editing still works. Disabled cells are skipped, the end of a row continues on the next row (and the start on the previous row), and the edge of a page continues on the adjacent page. |
| `Tab` / `Shift`+`Tab` | Exactly like `→` / `←`, except that they always leave the cell regardless of the caret. In a lookup cell the value is settled by `finishEditing()` first, as before. `Shift`+`Tab` from the very first cell leaves the table normally. |
| `←` / `→` / `Tab` / `Shift`+`Tab` while typing in a lookup cell | Accept the highlighted closest match, close the dropdown and move one cell left / right. See *Fast accept* below. |
| `↑` / `↓` | Move one cell vertically in the same column. On `number` inputs the default spinner behaviour is suppressed. Never moves the highlight inside a dropdown. |
| `↓` on the last row | No cell below, so the table creates the next row and focuses it — from a lookup cell as well as a plain one. |
| `Tab` from the last cell of the last row | Creates the next row and focuses its first cell. |
| `Enter` | In a Litho From / Litho To cell, commits the value and reorders the rows without leaving the cell. |
| `Delete` | Clears the cell when the whole value is selected, the caret is at the end, or the cell is already empty. Otherwise the browser default applies. |
| `Escape` (lookup cell) | Reverts the typed text and closes the dropdown. |
| `Escape` (any cell) | Also clears the Ctrl + click cell selection. |
| `Space` | Never intercepted — it types a space in every cell. |

All four horizontal keys share one mechanism: `getHorizontalStep(event)` in
`tableNavigation.ts` turns the key into `+1`, `-1` or `0`. The cell handler
(`handleCellNavigation`) moves within the rendered page; when it finds no
neighbour the event bubbles to `handleTableKeyDown`, which asks the same
function and continues in the adjacent row on the next / previous page through
`focusRowCell` (rows addressed by id, page switched first, cell focused — and so
scrolled into view — after the render). At the end of the document only `Tab`
reaches row creation.

### Comment cells

`lithologyComments` (and the hidden `lithologicalDescription`) are listed in
`COMMENT_FIELD_KEYS` in `constants.ts`. Their text is stored exactly as typed:
leading, trailing and repeated spaces survive editing, autosave, IndexedDB
restore, JSON import and JSON export. Every edit is re-normalised by
`touchRawLithoDocument`, which used to `trim()` every field and so deleted a
space as soon as it was typed at the end of a word; `normalizeFieldValue` in
`rawLithoHelpers.ts` now skips trimming for comment fields only. Codes and
depths are still trimmed on load. Validation can still treat whitespace-only
text as empty where a rule requires it.

### Cell selection, copy and paste

| Action | Behaviour |
| --- | --- |
| `Ctrl` + click (`⌘` + click on macOS) | Adds the cell to the selection, or removes it if it was already selected, and focuses it. Cells may be in any row or column and need not touch. |
| Plain click on a selected cell | Keeps the selection. |
| Plain click anywhere else (inside or outside the table) | Clears the selection. |
| `Escape` | Clears the selection. |
| `Ctrl` + `C` with a selection | Copies the selected cells (see below). |
| `Ctrl` + `V` with a selection | Pastes into the selection (see below). |
| `Ctrl` + `C` / `Ctrl` + `V` without a selection | Native input behaviour. A clipboard holding several cells (from Excel) pasted into a focused cell is the one exception: it pastes as a block from that cell. |

The selection is a list of `{ rowId, columnKey }`, never DOM positions, so the
highlight follows its rows through sorting and paging. Selecting does not change
any value. The handlers listen to the `copy` / `paste` events on the table body
only, so nothing outside the table and no browser shortcut is affected.

**Copy.** The clipboard gets tab-separated columns and newline-separated rows in
table column order, covering the bounding rectangle of the selection. Unselected
cells inside that rectangle are written as empty strings, so they keep the
selected cells' relative positions without exposing their values. Tabs and line
breaks inside a value become spaces in the clipboard text only.

**Paste.** Tabs separate columns, newlines separate rows, and one trailing line
break (as Excel writes) is ignored.

| Selection | Clipboard | Result |
| --- | --- | --- |
| one cell (or none, with a multi-cell clipboard) | any | The block is pasted with its top-left corner on that cell. |
| several cells | one value | The value fills every selected editable cell; disabled cells are skipped. |
| several cells forming a contiguous rectangle of the clipboard's shape | several values | Cell-for-cell mapping. |
| any other shape | several values | Rejected — "Selection does not match clipboard". |

A paste is all-or-nothing. It is planned by `planPaste` in
`rawLithoClipboard.ts` and applied by `applyCellEdits` in
`rawLithoDocumentOperations.ts` as one document edit, and it is rejected with a
toast — leaving every cell untouched — when:

- the block would run past the last row or column (paste never adds rows);
- a target is disabled (a lookup with no values loaded);
- a depth is not a number, or a lookup value is not a known code (codes match
  case-insensitively and are stored in the lookup's own spelling);
- it would empty a required field that has a value;
- it would invert a depth range or create a duplicate interval.

Accepted pastes keep row ids and whole row objects, are re-sorted by
`sortRowsByLithoFrom()`, and are autosaved to IndexedDB through the normal
`commitDocument` path.

### Fast accept: `→` / `←` / `Tab` / `Shift`+`Tab` in a lookup cell

Typing filters the list and the closest match is highlighted automatically
(ranked exact → prefix → substring, so an exact match always wins). `→`, `←`,
`Tab` and `Shift`+`Tab` all take that match through the same
`acceptClosestMatch` — there is no second matching algorithm:

```text
type "Unk" → "Unknown" is highlighted
  →  commit "Unknown", close the dropdown, focus the NEXT cell
  ←  commit "Unknown", close the dropdown, focus the PREVIOUS cell
  Tab        same as →
  Shift+Tab  same as ←
```

`Tab` keeps its own route after accepting: the next / previous cell on the
page, otherwise the table crosses the page or — `Tab` only, never
`Shift`+`Tab` — appends a row after the usual validation. The accepted value
is committed before focus moves, so row creation sees it.

Two guards keep it out of the way of everything else:

- **Nothing valid to accept** — no typed text, or no matching option — and the
  key falls through to ordinary cell navigation. A wrong value is never written.
- **The user has not typed in this cell** (`isSearching` is false, e.g. focus
  just arrived on a cell that already holds a value) and `←` / `→` keep their
  caret-edge behaviour, so an existing value can still be read and edited;
  `Tab` / `Shift`+`Tab` simply move on without touching the value.

The full-value routes are untouched: type the whole code and press `Enter` or
`Tab` (an exact match ranks first, so it is kept), or click an option.

Accepting moves focus, which fires `blur` before React has re-rendered with the
new value, so `finishEditing` would still see the partial text and flag it
invalid. `isAcceptingMatch` makes that one blur a no-op.

### How ArrowDown reaches the table

`keydown` bubbles from the input up to the `<tbody>`, so a cell handler runs
first. Cell handlers call `markKeyAsHandled(event)` once they have used a key,
and `handleTableKeyDown` skips any event where `isKeyAlreadyHandled(event)` is
true.

The dropdown does not use the vertical keys at all — suggestions are picked with
the mouse, the mouse wheel (the menu scrolls at `max-height: 220px`), `Enter`,
or fast accept. So `↓` in a lookup cell behaves exactly as it does in a plain
cell:

1. **A row exists below** → focus moves down one cell.
2. **Otherwise (last row)** → the event bubbles unhandled and the table creates
   a row, subject to the usual required-field and duplicate-interval checks.

`Tab` in a lookup cell first accepts the highlighted match (fast accept) or, with
nothing to accept, settles the value through `finishEditing()` before the table
considers creating a row. Leaving a lookup cell with unmatched text still
commits nothing — only an exact match commits on blur — so a required
lookup cell left half-typed blocks row creation with the usual warning.

Only the last page can create rows: `handleTableKeyDown` returns early unless
`currentPage === totalPages`, because the last rendered row is only the document's
final row on the final page.

---

## Pagination

| Setting | Value |
| --- | --- |
| Rows per page | `table.rowsPerPage: 50` in `config.yaml` (`RAW_LITHO_ROWS_PER_PAGE`) |
| Total pages | `max(1, ceil(rowCount / 50))` |
| Controls | Previous / Next buttons, `PageUp` / `PageDown` |

Pagination is a pure view concern: it slices the **already-sorted** `rows` for
rendering and never mutates them, so unsaved edits on other pages survive and no
row can land on the wrong page. Adding a row jumps to the page holding it after
sorting; a row that is reordered onto another page takes the caret with it;
removing rows clamps the current page. Changing pages resets the table's scroll
position and is written to the `session` store, so the page number is restored on
the next visit.

---

## State

### Local (React)

| State | Owner | Purpose |
| --- | --- | --- |
| `rawLithoDocument` | `useRawLithoWorkspace` | The whole document: project, campaign, drillhole, timestamps, rows |
| `selectedHoleId` | `useRawLithoWorkspace` | Selected drillhole |
| `currentPage` | `useRawLithoWorkspace` | Active table page |
| `loadedKey` | `useRawLithoDraftPersistence` | Gate for `isPageEnabled` — the table stays disabled until the draft for the selected drillhole has loaded |
| `isRestoringSession` | `useRawLithoDraftPersistence` | Suppresses the session write during the initial restore |
| `isSaving` | `RawLitho.tsx` | Disables Save while it runs |
| `drillholes`, `isLoading`, `error` | `useDrillholes` | Drillhole list, already in selector order |
| `recentHoleIds` | `useDrillholes` | The 3 most recently selected drillholes, mirrored in `recentHoleIdsRef` so recording a selection does not rebuild the callback |
| `lookupData`, `lookupStatus` | `useRawLithoLookups` | Dropdown records, per-field loading/error |
| `pendingImport`, `isImporting` | `useRawLithoImport` | Parsed-but-unconfirmed import |
| `toast` | `useToast` | The single active notification |
| `isConfirmOpen`, `isRemoving` | `useRemoveRowConfirmation` | Remove-last-row dialog visibility and in-flight write |

`documentRef` points to the current working document between React commits.
The persistence hook holds readiness, timers and restoration state. The save
queue retains pending snapshots by drillhole until a committed write succeeds.
Editing and saving require a successfully loaded draft; import requires an
empty drillhole selection.

### Persisted (IndexedDB)

Database `raw-litho-db` v4, through `services/IndexDB/rawLithoDatabase.ts`.

| Store | Key | Value |
| --- | --- | --- |
| `drafts` | drillhole id | the normalised document |
| `session` | `"active-raw-litho-session"` | `{ drillhole, page, updatedAt }` |
| `session` | `"recent-drillholes"` | `{ holeIds, updatedAt }` — the 3 most recently selected, most recent first |
| `drillholeCache` | `"all-drillholes"` | `{ records, updatedAt }` |

One record per drillhole, replaced on write. Rows are stored in Litho From
order, matching the table. The `Ins` number is derived from row order and never
stored, so it renumbers itself when rows move.

---

## Persistence behaviour

Each edit stages its document synchronously, then schedules a 400 ms debounce.
The save queue serializes writes for each drillhole, drains newer snapshots
received during a write, and keeps failed snapshots available for retry.
The persistence hook retries pending writes every 2 seconds while mounted, and
flushes on online, hidden visibility, pagehide, route unmount and drillhole switch.
Repeated save failures show one notification until a save succeeds.

Loading checks the in-memory pending snapshot before reading IndexedDB. Failed
or malformed loads leave editing disabled and do not write a blank replacement.
Loading retries every 2 seconds, or immediately when the drillhole is selected
again. Valid legacy drafts are normalized and sorted, preserving existing valid
row IDs; normalized migrations use the same save queue.

Session state is restored before writing the active drillhole/page. A user
selection made during restoration wins over the asynchronous stored session.
Clearing the selection removes the active session record.

The Save button validates lookup codes, stamps `modified_at`, stages the snapshot,
flushes pending saves and downloads `<drillhole>.json`. Export is still attempted
if IndexedDB saving fails, and the pending document is retained for retry.

Pagehide flushing is best effort: a browser crash, forced termination or rejected
storage writes cannot guarantee durable recovery. Concurrent browser tabs have
independent queues; this migration does not implement cross-tab conflict resolution.

## JSON import

Preparation validates without writing. Confirmation first saves any earlier edits,
then performs one ordered replacement write. Completion is reported only after
that write commits.

| Status | Meaning |
| --- | --- |
| `idle` | No current import |
| `preparing` | Reading and validating the selected file |
| `pending` | Validated and awaiting confirmation |
| `saving` | Confirmed, waiting for earlier saves or writing the replacement |
| `completed` | Replacement committed successfully |
| `failed` | Preparation or saving failed; a prepared plan may be explicitly retried |
| `cancelled` | Cancelled before replacement write submission |

Failed imports never remain in the autosave queue, so switching drillholes,
restoration or other save retries cannot apply them. Cancelling clears only the
import plan and preserves edit snapshots. New edits received while the import
waits cause it to fail for renewed review. Edits received during its submitted
write save afterwards; failed newer saves remain pending.

The dialog disables its buttons during saving. Internally cancellation can stop
a waiting import until the replacement write is submitted. After submission,
the write may commit and cannot be reported as cancelled. Context changes and
unmounts invalidate UI callbacks so stale completions cannot select an old hole.

```text
Import JSON → file picker → prepareRawLithoImport()      [zero writes]
    parse → validate structure → normalise → check lookup codes
    → check for an existing draft
                    ↓
            ConfirmDialog (row count, drillhole, replace warning)
             ├─ Cancel  → "Import cancelled"
             └─ Import  → applyRawLithoImport() → rawLithoSaveQueue.commitImport
                          → applyImportedDocument() → table shows the rows
```

Rejected before the dialog appears when the file is unreadable, is not valid
JSON, is not an object, is missing any of `project`, `campaign`, `drillhole`,
`created_at`, `modified_at`, `rows`, has a non-array `rows`, has a row that is
not an object, has an empty `drillhole`, or contains a lookup code that is not
in the loaded lookup data. Lookups that failed to load are skipped rather than
treated as invalid (`skipUnavailable: true`).

Normalisation on import: all 20 row fields become strings, unknown keys are
dropped, invalid or duplicate row ids are regenerated, and an empty `rows` array
becomes one blank row. Import derives its own draft key from the file's
`drillhole` value and switches the selection to it.

The Import button is enabled **only when no drillhole is selected**
(`canImport = !selectedHoleId`), so an import cannot silently overwrite the
drillhole being edited.

---

## Drillhole list ordering

The selector lists the holes the user is most likely to want, not the oldest
ones in the database:

```text
Drillhole A            ← most recently selected
Drillhole B            ← recently selected
Drillhole C            ← recently selected
Drillhole 2026-09-09   ← newest of the rest
Drillhole 2026-09-08
...
```

| Rule | Where |
| --- | --- |
| 3 most recently selected, most recent first | `orderDrillholes()` in `drillholeOrdering.ts` |
| How many are kept | `RECENT_DRILLHOLE_LIMIT = 3` in `drillholeOrdering.ts` |
| Then every remaining hole, newest first | `sortDrillholesByNewestFirst()` |
| No hole appears twice | a promoted hole is filtered out of the newest-first part |
| A remembered hole that no longer exists | skipped, and the list is simply shorter at the top |

`useDrillholes` returns the **already ordered** list, so `RawLithoFilters`
renders it as-is. Typing still ranks by match quality (exact → prefix →
substring, capped at 10), which deliberately overrides this order — a search is
a search.

**Newest first is the backend order reversed.** `/api/drillholes` returns the
records oldest first and they carry no date field, so that is the only signal
available. If the API ever returns a date, `sortDrillholesByNewestFirst()` is
the one function to change.

A selection is recorded by `handleDrillholeChange` in `RawLitho.tsx`, which
calls `rememberDrillholeSelection(holeId)` alongside `selectDrillhole(holeId)`.
Clearing the field is not a selection and is not recorded. Re-selecting the hole
already at the front changes nothing and skips the write.

---

## Dropdown data loading

`useRawLithoLookups` loads the nine API lookups in parallel, cache-first per
lookup:

```text
for each lookup:
  read raw-litho-lookup-cache-db → show cached records immediately (isLoading stays true)
  fetch the endpoint
    success → replace records, isLoading false, source "backend", refresh the cache
    failure → keep cached records and clear the error,
              or show "<label> lookup data is unavailable offline"
```

Granulo and Hardness are local (`source: "local"`, digits 0–9) and skip both the
network and the cache; the row passes `isLoading: false` and no error for them.

A lookup cell renders disabled when the page is disabled, or when it has no
options and is not loading. Its placeholder reflects the state: `Loading...`,
`Unavailable`, or `No values`.

`useDrillholes` follows the same shape for `/api/drillholes`: fetch, cache on
success, and fall back to `drillholeCache` on failure with a
"Using cached drillhole data" toast.

---

## Event handlers

### `RawLithoTable.tsx`

```text
requestAddRow()
- triggered by: Add Row button (onClick), F4, Tab at the row end, ArrowDown on
  the last row
- calls onAddRow() (= workspace.tryAddRow) which performs all validation and
  the reordering
- on success: requestFocus(result.rowId) — the new row is focused by id after
  render, wherever sorting placed it
- on rejection: focusRowCell(result.rowId, result.focusField), switching page
  first if that row is off-screen
- depends on: onAddRow, focusRowCell, requestFocus

handleTableKeyDown(event)
- bound to <tbody> onKeyDown
- Escape clears the cell selection
- returns early when: the page is disabled or blocked, or a cell handler already
  used the key
- Tab / Shift + Tab / ← / → at the page edge: focusAdjacentPageRow()
- otherwise returns early unless on the last page with a row-creation key
- for Tab-at-row-end and ArrowDown-on-last-row: preventDefault + requestAddRow()

document mousedown listener
- Ctrl / ⌘ + click on a cell: toggle it in selectedCells and focus it
- plain click outside the selection: clear selectedCells

handleCopy(event) / handlePaste(event)
- bound to <tbody> onCopy / onPaste
- copy: with a selection, writes buildClipboardText() to event.clipboardData
- paste: with a selection, or a multi-cell clipboard in a focused cell, runs
  planPaste() and hands the edits to onPasteCells (= workspace.pasteCells)
```

### `useRawLithoWorkspace.ts`

The hook owns the working document, selected drillhole, and current page.
A synchronous ref points to the same working document so edits followed by a
drillhole switch in the same React batch are staged before the switch.

- `updateRow`, `commitDepthEdit`, `sortRows`, `pasteCells`, `tryAddRow`,
  `removeLastRow` delegate transformations to `rawLithoDocumentOperations.ts`.
- `selectDrillhole` flushes pending edits and disables editing until the new
  draft is successfully loaded.
- `setRawLithoDocument` stages a document update; `flushPendingSaves` requests
  an immediate save and returns whether all pending writes succeeded.
- `applyImportedDocument` selects and reloads the confirmed, saved import.
- `retryDraftLoad`, `loadError`, and `saveError` expose recovery status.

### `useRawLithoDraftPersistence.ts`

Owns session restoration, loading, the 400 ms debounce, and 2 second retries.
It does not keep a second working document. Pending snapshots are recovery data
managed by `rawLithoSaveQueue.ts`, not a competing React state store.

A failed or malformed load leaves the table disabled and never creates a blank
replacement. Loads retry automatically; selecting a drillhole again also retries.
Failed saves retain the latest snapshot, retry while the workspace is mounted,
and flush on online, visibilitychange, pagehide, and route unmount. A tab crash
or forced browser termination cannot guarantee completion of an asynchronous write.

### `rawLithoDocumentOperations.ts`

Storage-free operations create, edit, validate, add, delete, and sort documents.
Unchanged rows retain their IDs; all validation outcomes use shared rules in
`rawLithoValidation.ts`. Normalization/import parsing stays in `rawLithoHelpers.ts`.

### `useRawLithoShortcuts.ts`

```text
handleShortcut(event, options)
- bound to a window keydown listener for the page's lifetime
- ignores any event with a modifier key
- F5: always preventDefault, then Remove Last Row if enabled, not blocked, and
  more than one row exists
- F4: preventDefault + onAddRow() (skipped when disabled or blocked)
- PageUp / PageDown: preventDefault + changePage, which does nothing past
  either end
```

### `RawLithoRow.tsx` (per cell)

```text
onKeyDown  Delete clears the cell (isClearCellRequest); Enter commits a depth
           cell via commitDepth; otherwise handleCellNavigation moves focus
           (arrows, Tab, Shift + Tab)
onFocus    remembers the pre-edit value of the depth cells
onChange   onRowChange(row.id, column.key, value) — never sorts
onBlur     depth cells call commitDepth, which forwards to onDepthCommit
           (range check + reorder)

commitDepth(columnKey)
- local helper; ignores non-depth columns
- calls onDepthCommit(row.id, columnKey, valueBeforeEdit)
- the single place both blur and Enter go through
```

### `LookupAutocomplete.tsx`

```text
handleQueryChange   filters suggestions; clears the committed value while the
                    text no longer matches it
acceptClosestMatch  → / ← while typing: commit the highlighted match and move
                    one cell; returns false when there is nothing valid to take
↑ / ↓               handed straight to handleCellNavigation — cell navigation,
                    or bubble up so the table can add a row
Tab / Shift + Tab   acceptClosestMatch when searching; otherwise
                    finishEditing, then handleCellNavigation
finishEditing       on blur/Tab: empty clears, an exact match commits, anything
                    else is flagged "Select a valid value"
selectSuggestion    commits a clicked or Enter-selected option
clearCellValue      Delete empties the cell and reopens the dropdown
```

### `hooks/useRemoveRowConfirmation.ts`

```text
requestRemoveLastRow()
- triggered by: the Remove Last Row button and F5
- opens the confirmation dialog; changes nothing

cancelRemoveLastRow()
- triggered by: Cancel, Escape
- closes the dialog; no removal, no write, no toast
- ignored while a removal is already in flight

confirmRemoveLastRow()
- triggered by: the Remove button
- awaits onRemoveLastRow() (= workspace.removeLastRow)
- closes the dialog, then shows "Row removed" or "Action failed"
- guarded against a double submit by isRemoving
```

### `hooks/useRawLithoRowFocus.ts`

```text
handleTableFocus(event)
- bound to the table body's onFocus
- records { rowId, columnKey } for the cell the user is in

focusRowCell(rowId, columnKey)
- focuses that cell now; if the row is not rendered, finds its page,
  switches to it and focuses after the render

requestFocus(rowId, columnKey)
- queues focus for a row that does not exist in the DOM yet (a new row)

reorder effect
- runs when the row id order changes
- skips when a specific focus request is already queued
- skips when focus is on a real element (a deliberate move is not stolen)
- otherwise restores focus to the last tracked cell, by row id
```

### `RawLitho.tsx`

```text
handleSave   see "Save button" above
```

---

## Quick reference

| Question | Answer |
| --- | --- |
| Where is a row created? | `tryAddRow()` in `hooks/useRawLithoWorkspace.ts` |
| Where are rows sorted? | `sortRowsByLithoFrom()` in `rawLithoSorting.ts` — the only sorting code |
| What triggers a sort? | `commitDepthEdit` (blur/Enter), `tryAddRow`, import, restore |
| Why doesn't my row move as I type? | By design — sorting waits for the value to commit |
| Where is focus moved? | `hooks/useRawLithoRowFocus.ts` + `focusCellInRow` in `tableNavigation.ts` |
| How does focus survive a reorder? | Rows are addressed by `row.id` via `data-row-id`, never by index |
| Where are the validation rules? | `rawLithoValidation.ts` (pure); toast text in `constants.ts` |
| Where are the required fields listed? | `REQUIRED_COLUMN_KEY_LIST` in `constants.ts` |
| Which fields are copied to a new row? | `ROW_COPY_FIELD_KEYS` in `constants.ts` |
| Where do I change rows per page, columns or widths? | `config.yaml` |
| Where is the styling? | Tailwind utilities in the components; shared lists in `rawLithoStyles.ts`; tokens in `src/css/index.css` |
| Where are the shortcuts? | `hooks/useRawLithoShortcuts.ts` |
| Where is horizontal navigation (arrows, Tab)? | `getHorizontalStep` / `handleCellNavigation` in `tableNavigation.ts`, page crossing in `RawLithoTable.tsx` |
| Where is copy / paste? | `rawLithoClipboard.ts` (pure), handlers in `RawLithoTable.tsx`, `applyCellEdits` in `rawLithoDocumentOperations.ts` |
| Which fields keep their spaces? | `COMMENT_FIELD_KEYS` in `constants.ts` |
| How do I accept a partly typed lookup code? | `→` or `←` — `acceptClosestMatch` in `LookupAutocomplete.tsx` |
| Why doesn't `↓` move inside a dropdown? | By design — the vertical keys belong to the table, so `↓` can add a row from any cell |
| Where is the drillhole list order decided? | `orderDrillholes()` in `drillholeOrdering.ts` — the only place |
| How many recent drillholes are kept? | `RECENT_DRILLHOLE_LIMIT` in `drillholeOrdering.ts` |
| Where do I change a toast message? | `TOAST_NOTIFICATIONS` in `constants.ts` |
| How do I show a toast? | `showToast(TOAST_NOTIFICATIONS.<key>)` from `hooks/useToast.ts` |
| Which handler confirms a removal? | `confirmRemoveLastRow` in `hooks/useRemoveRowConfirmation.ts` |
| Why did removal not delete immediately? | Both the button and F5 open a confirmation first |
| What is persisted? | `drafts`, `session`, `drillholeCache` in `raw-litho-db`; lookups in `raw-litho-lookup-cache-db` |
| Is the stored order the displayed order? | Yes — the sorted array is what gets written |
| Which APIs does this page call? | 9 lookup endpoints + `/api/drillholes`. No writes. |

---

## Manual test checklist

1. Select a drillhole; the table becomes editable and shows page 1 of 50-row pages.
2. Enter `10 → 15`, add a row, enter `15 → 20`, add a row, then set the third row's Litho From to `13` and Tab out → the rows reorder to `10, 13, 15` and the `Ins` numbers renumber.
3. While typing into Litho From, confirm the row does **not** jump on each keystroke; it moves only once you blur or press Enter.
4. Type a new Litho From and press Enter → the row reorders and the caret stays in the cell.
5. Give a row distinctive values (Litho Code, Colour, Redox, OX, CA, comments), move it with a Litho From edit, and confirm every value travelled with it.
6. Confirm rows order numerically: `2`, `10`, `100` — not `10`, `100`, `2`.
7. Give two rows the same Litho From but different Litho To → the smaller Litho To sits first.
8. Clear a row's Litho From → it drops to the bottom of the table and blocks Add Row until refilled.
9. With more than 50 rows, edit a row's Litho From so it belongs on another page → the table follows it and the caret stays on that row.
10. Click the Save button straight after typing a Litho From that reorders the rows → the reorder happens but focus stays on the button.
11. Leave `Redox Code` empty and press Add Row → no row, warning toast, focus lands in `Redox Code`.
12. Fill the required fields, then Tab from the last cell → a row is created with Litho Code, Color Code, Redox Code and OX copied and `Litho From` continuing from the previous `Litho To`.
13. Confirm `CA`, `PY`, `Sedim`, `Granulo`, `Hardness` and the comments are **not** copied.
14. Enter an interval that already exists → both rows' depth cells turn orange, the duplicate warning appears, and Add Row / F4 / Tab / ArrowDown all refuse to advance while focus stays in `Litho To`. Confirm this still holds after the rows have been reordered.
15. Change the duplicate to a unique interval → creation works again.
16. Press `F4`; confirm a "Row added" toast appears for the button, F4, Tab and ArrowDown alike, and that a blocked attempt shows a warning instead.
17. Press `F5`; confirm it opens "Remove last row?" rather than deleting, does not refresh the browser, and that Cancel leaves the table untouched with no toast.
18. Confirm the removal → the row disappears and "Row removed" appears; reload and check the row is still gone.
19. In the confirmation dialog, check Cancel holds focus, Escape cancels, and Remove is the only red button.
20. Add more than 50 rows; use `PageUp`/`PageDown` and confirm both ends are no-ops and edits on other pages are intact.
21. On page 1 with an invalid last row, press `F4` → the table jumps to the page holding it and focuses the offending cell.
22. In a lookup cell on the last row, press `↓` with the dropdown open → the highlight does **not** move and a row is created (or the required-field warning appears). On any earlier row, `↓` moves down one cell.
23. In a Litho Code cell, type a partial code (for example `Unk`) → the closest match is highlighted at the top of the list. Press `→` → the cell reads `Unknown`, the dropdown closes and focus is on the next cell. Repeat with `←` → focus lands on the previous cell.
24. Type nonsense (`Zzz`) in a lookup cell and press `→` → nothing is inserted; the cell keeps the typed text and is flagged "Select a valid value" on blur.
25. Focus a lookup cell that already has a value without typing → `←` / `→` still walk the caret through the text before leaving the cell.
26. Confirm the untouched routes: type a full code and press `Enter`, then `Tab`, then click an option with the mouse; scroll the option list with the mouse wheel.
27. Select drillholes A, then B, then C → reopen the list: C, B, A appear at the top, followed by the newest remaining holes, and none of the three is repeated further down. Select a fourth → it takes the front and A drops off. Reload the page and confirm the order survived.
28. Navigate away and back → the same drillhole, rows, order and page are restored.
29. Reload after a successful save → the last change and row order are intact. Pagehide flushing of pending edits is best effort.
30. Clear the drillhole, import a JSON file whose rows are out of order, cancel the dialog → nothing changes; import again and confirm → the rows appear sorted.
31. Press Save → `<drillhole>.json` downloads with rows in Litho From order and "Changes saved" appears.
32. Press `Tab` / `Shift`+`Tab` across a row → focus moves exactly like `→` / `←`, skips disabled lookups, wraps to the next / previous row, and crosses from row 50 to row 51 on the next page and back.
33. Type `Fine grained  sandstone ` (double space, trailing space) in Lithology Comments → every space stays; reload, then Save and re-import the JSON → still identical.
34. `Ctrl`+click three cells in different rows → all highlighted; `Ctrl`+click one again → deselected; click any other cell → selection cleared.
35. Select two non-adjacent cells, `Ctrl`+`C`, paste into Excel → the values keep their relative positions with blank cells between them.
36. Copy a 2 × 3 block from Excel, `Ctrl`+click one cell, `Ctrl`+`V` → the block lands from that cell; a Litho From change re-sorts the rows and the selection follows its rows.
37. Paste `abc` into Litho From, a block past the last row, or a value that inverts / duplicates an interval → a warning toast appears and no cell changes.
38. Select several comment cells and paste one value → every selected cell receives it; reload → still there.
