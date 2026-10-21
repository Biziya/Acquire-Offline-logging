import type {
  RawLithoRow,
  RowId,
  RowField,
  ToastNotification,
} from "../../types/domain";
import { columnByKey, createSchemaRow } from "../../types/rawLithoSchema";
import { toPercentWidths } from "../../components/dataTableStyles";
import { rawLithoConfig } from "./config";
export { columns } from "../../types/rawLithoSchema";

// This list controls table presentation only: which columns are shown, in
// which order, with which header and width (config.yaml). The complete
// `columns` list above remains the source for state, JSON import/export, and
// IndexedDB data. Hidden fields are kept in config.yaml with `visible: false`.
// Widths become percentages so the table always fits the page.
const visibleColumns = rawLithoConfig.columns.filter((column) => column.visible);
const [indexWidth = "auto", ...columnWidths] = toPercentWidths([
  rawLithoConfig.indexColumnWidth,
  ...visibleColumns.map((column) => column.width),
]);

export const INDEX_COLUMN_WIDTH = indexWidth;
export const tableColumns = visibleColumns.map(({ key, label }, index) => ({
  ...columnByKey[key],
  label,
  width: columnWidths[index] ?? "auto",
}));

// Ordered so validation can report the FIRST missing required cell and move
// focus straight to it. `REQUIRED_COLUMN_KEYS` stays a Set for cheap lookups
// during rendering.
export const REQUIRED_COLUMN_KEY_LIST = Object.freeze<RowField[]>([
  "lithoFrom",
  "lithoTo",
  "lithoCode",
  "colorCode",
  "redoxCode",
]);

export const REQUIRED_COLUMN_KEYS = new Set(REQUIRED_COLUMN_KEY_LIST);

// Values carried over from the previous row when a new row is created.
// `lithoFrom` is handled separately because it copies the previous `lithoTo`.
export const ROW_COPY_FIELD_KEYS = Object.freeze<RowField[]>([
  "lithoCode",
  "colorCode",
  "redoxCode",
  "ox",
]);

// Free-text fields keep exactly what the user typed, including leading,
// trailing and repeated spaces. Codes and depths are still trimmed on load.
export const COMMENT_FIELD_KEYS = new Set<RowField>([
  "lithologyComments",
  "lithologicalDescription",
]);

export const COMPACT_COLUMN_KEYS = new Set<RowField>(
  rawLithoConfig.columns
    .filter((column) => column.compact)
    .map((column) => column.key),
);

/*
 * Every user-facing notification in one place.
 *
 * Messages are deliberately 2-5 words: a toast reports status at a glance, it
 * does not explain. Detail belongs next to the offending field (the required
 * and duplicate cell styling) or inside a dialog.
 *
 * Types: success | warning | error | info
 *   success  the action completed
 *   warning  the action was refused, the user can fix it
 *   error    something failed unexpectedly
 *   info     neutral status, nothing to act on
 */
export const TOAST_NOTIFICATIONS = {
  rowAdded: {
    message: "Row added",
    type: "success",
  },
  rowRemoved: {
    message: "Row removed",
    type: "success",
  },
  saveSuccess: {
    message: "Changes saved",
    type: "success",
  },
  saveFailed: {
    message: "Save failed",
    type: "error",
  },
  actionFailed: {
    message: "Action failed",
    type: "error",
  },
  importSuccess: {
    message: "Import complete",
    type: "success",
  },
  importFailed: {
    message: "Import failed",
    type: "error",
  },
  importCancelled: {
    message: "Import cancelled",
    type: "info",
  },
  importNeedsLookupCorrection: {
    message: "Fix lookup codes",
    type: "warning",
  },
  cachedDrillholesLoaded: {
    message: "Using offline data",
    type: "info",
  },
  drillholeCacheFailed: {
    message: "Offline cache failed",
    type: "warning",
  },
  draftSaveFailed: {
    message: "Changes not saved",
    type: "error",
  },
  draftLoadFailed: {
    message: "Could not load data",
    type: "error",
  },
  missingRequiredFields: {
    message: "Complete required fields",
    type: "warning",
  },
  duplicateInterval: {
    message: "Duplicate interval",
    type: "warning",
  },
  invalidDepthRange: {
    message: "Invalid depth range",
    type: "warning",
  },
  invalidLookupValue: {
    message: "Invalid lookup codes",
    type: "warning",
  },
  cellsCopied: {
    message: "Cells copied",
    type: "info",
  },
  invalidPasteValue: {
    message: "Invalid pasted value",
    type: "warning",
  },
  pasteShapeMismatch: {
    message: "Selection does not match clipboard",
    type: "warning",
  },
  pasteOutOfRange: {
    message: "Paste exceeds table",
    type: "warning",
  },
  pasteNotEditable: {
    message: "Cells not editable",
    type: "warning",
  },
  clipboardUnavailable: {
    message: "Clipboard unavailable",
    type: "error",
  },
} satisfies Record<string, ToastNotification>;

export const RAW_LITHO_ROWS_PER_PAGE = rawLithoConfig.rowsPerPage;

export function createEmptyRow(id: RowId): RawLithoRow {
  return createSchemaRow(id);
}

/*
 * Builds the row that follows `previousRow`.
 *
 * `lithoFrom` continues from the previous `lithoTo` so depth ranges stay
 * contiguous, and `ROW_COPY_FIELD_KEYS` are carried over because they rarely
 * change between adjacent intervals. Every other field starts empty.
 */
export function createRowFromPrevious(
  previousRow: RawLithoRow | undefined,
  id: RowId,
) {
  const nextRow = createEmptyRow(id);

  nextRow.lithoFrom = previousRow?.lithoTo ?? "";
  ROW_COPY_FIELD_KEYS.forEach((fieldKey) => {
    nextRow[fieldKey] = previousRow?.[fieldKey] ?? "";
  });

  return nextRow;
}
