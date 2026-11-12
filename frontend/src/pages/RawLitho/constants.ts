import type {
  RawLithoRow,
  RowId,
  RowField,
  ToastNotification,
} from "../../types/domain";
import { columnByKey, createSchemaRow } from "../../types/rawLithoSchema";
import { toPercentWidths } from "../../components/dataTableStyles";
import { rawLithoConfig } from "./config";

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

// Free-text fields retain trailing and repeated spaces. Lithology Comments
// additionally removes leading whitespace in the shared field normalizer.
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
 * A success says what happened in a few words. A warning or error also says
 * what to do next.
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
    message: "Saved. The JSON file is in your downloads.",
    type: "success",
  },
  saveFailed: {
    message: "Couldn't save. Your edits are still here, so try Save JSON again.",
    type: "error",
  },
  actionFailed: {
    message: "Couldn't remove the row. Try again.",
    type: "error",
  },
  importSuccess: {
    message: "File imported",
    type: "success",
  },
  importFailed: {
    message: "Couldn't import the file",
    type: "error",
  },
  importCancelled: {
    message: "Import cancelled",
    type: "info",
  },
  cachedDrillholesLoaded: {
    message: "Server is offline. Showing the drillhole list saved on this PC.",
    type: "info",
  },
  drillholeCacheFailed: {
    message: "Couldn't keep a copy of the drillhole list for offline use",
    type: "warning",
  },
  draftSaveFailed: {
    message: "Couldn't save your last edit on this PC. Keep this page open and try again.",
    type: "error",
  },
  draftLoadFailed: {
    message: "Couldn't load the saved rows for this drillhole. Reload the page to try again.",
    type: "error",
  },
  missingRequiredFields: {
    message: "Fill in the required (*) cells of the last row first",
    type: "warning",
  },
  duplicateInterval: {
    message: "This From / To interval is already in the table",
    type: "warning",
  },
  invalidDepthRange: {
    message: "From must be less than To. The previous depth was kept.",
    type: "warning",
  },
  invalidLookupValue: {
    message: "Some codes aren't in their list. Fix them, then save.",
    type: "warning",
  },
  cellsCopied: {
    message: "Cells copied",
    type: "info",
  },
  invalidPasteValue: {
    message: "Some pasted values don't fit these columns. Nothing was pasted.",
    type: "warning",
  },
  pasteShapeMismatch: {
    message: "The copied cells don't match the selected cells. Nothing was pasted.",
    type: "warning",
  },
  pasteOutOfRange: {
    message: "The copied cells don't fit in the table. Nothing was pasted.",
    type: "warning",
  },
  pasteNotEditable: {
    message: "These cells can't be edited. Nothing was pasted.",
    type: "warning",
  },
  clipboardUnavailable: {
    message: "Couldn't use the clipboard. Allow clipboard access in the browser and try again.",
    type: "error",
  },
} satisfies Record<string, ToastNotification>;

export const RAW_LITHO_ROWS_PER_PAGE = rawLithoConfig.rowsPerPage;

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
  const nextRow = createSchemaRow(id);

  nextRow.lithoFrom = previousRow?.lithoTo ?? "";
  ROW_COPY_FIELD_KEYS.forEach((fieldKey) => {
    nextRow[fieldKey] = previousRow?.[fieldKey] ?? "";
  });

  return nextRow;
}
