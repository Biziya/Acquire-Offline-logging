# Upload Data page

Route: `/upload-data` · Component: `UploadData.tsx`

## Purpose

Selects one completed JSON dataset from the local disk, shows its identifying
fields for review, and uploads the file to the backend. The page reads the file
in the browser to build the summary, then sends the **original file** to
`POST /api/uploaddata`.

This page stores nothing locally: no IndexedDB, no Local Storage, no draft.
Nothing survives a refresh.

## Folder tree

```text
UploadData/
├── DatasetSummary.tsx      renders the four summary fields from props
├── README.md               this file
├── UploadData.css          page styling
├── UploadData.tsx          page container: state, file reading, upload
├── UploadFileSection.tsx   hidden file input + Upload JSON button
└── ValidationSummary.tsx   NOT imported — see below
```

`ValidationSummary.tsx` is not imported by anything. It is a near-duplicate of
`DatasetSummary.tsx` with hard-coded placeholder values (and its component is
also named `DatasetSummary`). Treat it as dead code.

## Page structure

Two numbered sections, then the action buttons:

```text
1  File Selection    UploadFileSection.tsx
2  Dataset Summary   DatasetSummary.tsx
   [Cancel]  [Import Data]
```

## File responsibilities

```text
UploadData.tsx
- owns all state: summary, selectedFile, parsedJson, errors, isImporting
- handleFileSelect: reads and parses the file, builds the summary
- handleImport: POSTs the file via importUploadData
- handleCancel: aborts an in-flight request and resets every field
- guards against stale results with fileSelectionIdRef and requestControllerRef

UploadFileSection.tsx
- owns the hidden <input type="file" accept=".json,application/json">
- the "Upload JSON" button opens the picker
- clears input.value after each pick so the same file can be chosen again
- displays the selected filename and any file error

DatasetSummary.tsx
- presentational only; receives the summary object through props
- renders File Name, Project, Campaign, Drillhole as a <dl>
```

## Local state

| State | Purpose |
| --- | --- |
| `summary` | The four displayed values. Starts as `EMPTY_SUMMARY`. |
| `selectedFile` | The `File` object, sent on import. |
| `parsedJson` | The parsed object. Its presence enables **Import Data**. |
| `fileError` | Inline error in section 1. |
| `importError` | Upload failure message. |
| `successMessage` | Server message, or "Data imported successfully." |
| `isImporting` | Disables the button and shows "Importing…". |
| `requestControllerRef` | `AbortController` for the in-flight upload. |
| `fileSelectionIdRef` | Increments per selection so a slow read cannot overwrite a newer one. |

No persisted state.

## Reading a file

```text
Upload JSON → file picker → handleFileSelect(file)
  abort any in-flight upload, clear all state
  check the extension or MIME type is JSON
  await file.text() → JSON.parse
  check the root is an object (not an array, not null)
  → fill the summary
```

Validation is deliberately shallow: **only** that the file looks like JSON and
that its root is an object. `project`, `campaign`, `drillhole`, and `rows` are
read if present but their types are never checked, and a missing field simply
shows as `—`. Row contents are never inspected.

`displayValue` renders `—` for anything that is not a non-blank string, so
whitespace-only values show as `—` too.

The import is rejected when the file is not JSON by extension or MIME type,
cannot be read, contains invalid JSON syntax, or has an array or `null` root. In
those cases the summary resets and an inline error appears in section 1.

### Expected shape

```json
{
  "project": "Project name",
  "campaign": "Campaign name",
  "drillhole": "Drillhole name",
  "rows": []
}
```

This matches the document exported by the Raw Litho page, so a Raw Litho export
can be uploaded here directly. Extra top-level fields are ignored by the
summary and still sent to the server.

## Uploading

```text
Import Data → handleImport()
  POST /api/uploaddata   multipart/form-data, field name "file"
    ok    → successMessage (server message, or the default)
    error → importError
    abort → silently ignored
```

The **original file** is uploaded, not the parsed object — the server receives
exactly the bytes on disk. Requests carry an `AbortController` signal;
**Cancel** aborts an in-flight upload and clears the page. `isImporting` is only
reset when the finishing request is still the current one, so a superseded
response cannot re-enable the button.

Error text comes from `services/Api/uploadData.ts`, which reads `detail`,
`message`, or `title` from a JSON body, uses a plain-text body as-is, and
reports connection failures as
"Unable to connect to the server. Please try again."

## Handlers

```text
handleFileSelect(file)
- triggered by: choosing a file in the picker
- aborts any in-flight upload and clears summary, file, errors, messages
- validates the type, reads and parses, checks the root is an object
- on success: stores the file and parsed object, fills the summary
- on failure: sets fileError and leaves the placeholders in place
- stale-guard: fileSelectionIdRef

handleImport()
- triggered by: Import Data
- no-op without parsedJson, or while already importing
- POSTs the file; sets successMessage or importError

handleCancel()
- triggered by: Cancel
- aborts the in-flight request and resets every piece of state
- also invalidates any in-progress file read
```

## Quick reference

| Question | Answer |
| --- | --- |
| Which API does this page call? | `POST /api/uploaddata` only |
| What is persisted? | Nothing |
| What validation exists? | JSON type/extension, parseable JSON, object root. No field-level checks. |
| Where do I add field validation? | `handleFileSelect` in `UploadData.tsx` |
| Which button uploads? | **Import Data**; **Upload JSON** only opens the picker |

## Current limitations

- No field-level or row-level validation before upload.
- No progress indication beyond the "Importing…" label.
- No persistence: a refresh clears the selection.
- Single file only; no `multiple` attribute and no drag-and-drop.
- `ValidationSummary.tsx` is unused dead code.

## Manual test checklist

1. Pick a valid JSON dataset and confirm all four summary fields populate.
2. Pick a file whose `project` is empty or whitespace → that field shows `—`.
3. Pick malformed JSON → placeholders return and an inline error appears.
4. Pick a JSON file with an array root → rejected the same way.
5. Open the picker and cancel → the current summary is unchanged.
6. Pick the same file twice → it is processed both times.
7. Confirm **Import Data** is disabled until a valid file is loaded.
8. Import with the backend stopped → a connection error appears, not a crash.
9. Start an import and press **Cancel** → the request aborts and the page resets.
10. Refresh → the summary returns to its placeholders.
