import type {
  RawLithoRow,
  RowId,
  RowField,
  ToastNotification,
} from "../../types/domain";
import { columnByKey, createSchemaRow } from "../../types/rawLithoSchema";
export { columns } from "../../types/rawLithoSchema";

// This list controls table presentation only. The complete `columns` list
// above remains the source for state, JSON import/export, and IndexedDB data.
export const tableColumns = [
  /*
   * CAUTION:
   * This column is intentionally hidden for the current UI.
   * Do NOT delete this code.
   * It will be reused in a future implementation.
   */
  // columnByKey.extractionType,

  /*
   * CAUTION:
   * This column is intentionally hidden for the current UI.
   * Do NOT delete this code.
   * It will be reused in a future implementation.
   */
  // columnByKey.corePass,

  /*
   * CAUTION:
   * This column is intentionally hidden for the current UI.
   * Do NOT delete this code.
   * It will be reused in a future implementation.
   */
  // columnByKey.recoveryStart,

  /*
   * CAUTION:
   * This column is intentionally hidden for the current UI.
   * Do NOT delete this code.
   * It will be reused in a future implementation.
   */
  // columnByKey.recoveryEnd,

  // columnByKey.coreEnd,
  columnByKey.lithoFrom,
  columnByKey.lithoTo,
  columnByKey.lithoCode,
  columnByKey.colorCode,
  columnByKey.ca,
  columnByKey.om,
  columnByKey.omFacies,
  columnByKey.py,
  columnByKey.ox,
  columnByKey.sedim,
  columnByKey.redoxCode,
  columnByKey.lithologyComments,

  columnByKey.granulo,
  columnByKey.hardness,

  /*
   * CAUTION:
   * This column is intentionally hidden for the current UI.
   * Do NOT delete this code.
   * It will be reused in a future implementation.
   */
  // columnByKey.lithologicalDescription,
];

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

export const COMPACT_COLUMN_KEYS = new Set<RowField>([
  "ca",
  "om",
  "py",
  "ox",
  "sedim",
  "granulo",
  "hardness",
]);

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
    duration: 1800,
  },
  rowRemoved: {
    message: "Row removed",
    type: "success",
    duration: 1800,
  },
  saveSuccess: {
    message: "Changes saved",
    type: "success",
    duration: 2500,
  },
  saveFailed: {
    message: "Save failed",
    type: "error",
    duration: 3000,
  },
  actionFailed: {
    message: "Action failed",
    type: "error",
    duration: 3000,
  },
  importSuccess: {
    message: "Import complete",
    type: "success",
    duration: 2500,
  },
  importFailed: {
    message: "Import failed",
    type: "error",
    duration: 3000,
  },
  importCancelled: {
    message: "Import cancelled",
    type: "info",
    duration: 2000,
  },
  importNeedsLookupCorrection: {
    message: "Fix lookup codes",
    type: "warning",
    duration: 3000,
  },
  cachedDrillholesLoaded: {
    message: "Using offline data",
    type: "info",
    duration: 2500,
  },
  drillholeCacheFailed: {
    message: "Offline cache failed",
    type: "warning",
    duration: 2500,
  },
  draftSaveFailed: {
    message: "Changes not saved",
    type: "error",
    duration: 3500,
  },
  draftLoadFailed: {
    message: "Could not load data",
    type: "error",
    duration: 3500,
  },
  missingRequiredFields: {
    message: "Complete required fields",
    type: "warning",
    duration: 2500,
  },
  duplicateInterval: {
    message: "Duplicate interval",
    type: "warning",
    duration: 2500,
  },
  invalidDepthRange: {
    message: "Invalid depth range",
    type: "warning",
    duration: 2500,
  },
  invalidLookupValue: {
    message: "Invalid lookup codes",
    type: "warning",
    duration: 2500,
  },
  cellsCopied: {
    message: "Cells copied",
    type: "info",
    duration: 1500,
  },
  invalidPasteValue: {
    message: "Invalid pasted value",
    type: "warning",
    duration: 2500,
  },
  pasteShapeMismatch: {
    message: "Selection does not match clipboard",
    type: "warning",
    duration: 3000,
  },
  pasteOutOfRange: {
    message: "Paste exceeds table",
    type: "warning",
    duration: 2500,
  },
  pasteNotEditable: {
    message: "Cells not editable",
    type: "warning",
    duration: 2500,
  },
  clipboardUnavailable: {
    message: "Clipboard unavailable",
    type: "error",
    duration: 3000,
  },
} satisfies Record<string, ToastNotification>;

export const RAW_LITHO_ROWS_PER_PAGE = 50;

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
