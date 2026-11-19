import type { LookupData, RawLithoRow, RowField } from "../../types/domain";
import { RAW_LITHO_LOOKUP_BY_FIELD } from "../../services/rawLithoLookupConfig";
import { COMMENT_FIELD_KEYS, tableColumns } from "./constants";
import { isValidDepth, normalizeLookupCode } from "./rawLithoValidation";
import { normalizeFieldValue } from "./rawLithoHelpers";
import * as shared from "../../components/dataTable/tableSelection";

/*
 * Copy and paste for the Raw Litho table.
 *
 * Everything here is pure: cells are addressed by stable row id and column key
 * (never by DOM position), and positions are resolved against the full `rows`
 * array in table column order. Applying the edits, validating the resulting
 * rows and sorting them is the document operation's job.
 */

export type CellRef = shared.CellRef<RowField>;

export interface CellEdit extends CellRef {
  value: string;
}

export type PasteIssue =
  | "pasteShapeMismatch"
  | "pasteOutOfRange"
  | "pasteNotEditable"
  | "invalidPasteValue"
  | "invalidLookupValue";

export type PastePlan = { edits: CellEdit[] } | { issue: PasteIssue };

const COLUMN_KEYS: readonly RowField[] = tableColumns.map(
  (column) => column.key,
);

export { isSameCell, mergeCells, formatRowNumbers } from "../../components/dataTable/tableSelection";

const idsOf = (rows: readonly RawLithoRow[]) => rows.map((row) => String(row.id));

/*
 * The shared selection helpers (components/dataTable/tableSelection.ts),
 * bound to Raw Litho's rows and visible columns. Rows span the full `rows`
 * order, including rows scrolled out of the rendered window.
 */
export function getCellRange(rows: readonly RawLithoRow[], anchor: CellRef, target: CellRef) {
  return shared.getCellRange(idsOf(rows), COLUMN_KEYS, anchor, target);
}

/* Every visible cell of one row (a click on the row number). */
export function getRowCells(rowId: string): CellRef[] {
  return shared.getRowCells(rowId, COLUMN_KEYS);
}

export function getRowRange(rows: readonly RawLithoRow[], anchorRowId: string, targetRowId: string) {
  return shared.getRowRange(idsOf(rows), COLUMN_KEYS, anchorRowId, targetRowId);
}

/* Rows (table order) whose every visible cell is in `cells`. */
export function getFullySelectedRowIds(rows: readonly RawLithoRow[], cells: readonly CellRef[]) {
  return shared.getFullySelectedRowIds(idsOf(rows), COLUMN_KEYS, cells);
}

/* The table cell containing `element`, or null outside the data columns. */
export function getCellRef(element: EventTarget | null): CellRef | null {
  return shared.getCellRefFromElement(element, COLUMN_KEYS);
}

interface CellPosition {
  row: number;
  column: number;
}

function locateCells(rows: RawLithoRow[], cells: CellRef[]) {
  // One lookup table, so selecting all of a long drillhole stays linear.
  const rowIndexById = new Map(rows.map((item, index) => [String(item.id), index]));
  return cells.flatMap((cell): CellPosition[] => {
    const row = rowIndexById.get(cell.rowId) ?? -1;
    const column = COLUMN_KEYS.indexOf(cell.columnKey);

    return row === -1 || column === -1 ? [] : [{ row, column }];
  });
}

function getBounds(positions: CellPosition[]) {
  // A loop, not Math.min(...): a whole-table selection is tens of thousands of cells.
  let [top, left, bottom, right] = [Infinity, Infinity, -Infinity, -Infinity];
  positions.forEach(({ row, column }) => {
    top = Math.min(top, row);
    bottom = Math.max(bottom, row);
    left = Math.min(left, column);
    right = Math.max(right, column);
  });

  return { top, left, height: bottom - top + 1, width: right - left + 1 };
}

/*
 * Tab-separated text for the selected cells, ready for Excel.
 *
 * The output covers the bounding rectangle of the selection so non-adjacent
 * cells keep their relative positions. Unselected cells inside it are written
 * as empty strings, so no unselected value ever reaches the clipboard. Tabs and
 * line breaks inside a value would break the grid, so they become spaces in the
 * clipboard text only; the record itself is untouched.
 */
export function buildClipboardText(rows: RawLithoRow[], selection: CellRef[]) {
  const positions = locateCells(rows, selection);
  if (positions.length === 0) return "";

  const { top, left, height, width } = getBounds(positions);
  const selected = new Set(
    positions.map((position) => `${position.row}:${position.column}`),
  );

  return Array.from({ length: height }, (_, rowOffset) =>
    Array.from({ length: width }, (_, columnOffset) => {
      const row = top + rowOffset;
      const column = left + columnOffset;
      if (!selected.has(`${row}:${column}`)) return "";

      const columnKey = COLUMN_KEYS[column];
      const value = columnKey ? (rows[row]?.[columnKey] ?? "") : "";

      return value.replace(/[\t\r\n]+/g, " ");
    }).join("\t"),
  ).join("\n");
}

/* Rows of cells: newlines separate rows, tabs separate columns. */
export function parseClipboardText(text: string) {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");

  // Excel ends a copied range with a line break.
  if (lines.length > 1 && lines[lines.length - 1] === "") lines.pop();

  return lines.map((line) => line.split("\t"));
}

export function isTabularClipboard(grid: string[][]) {
  return grid.length > 1 || (grid[0]?.length ?? 0) > 1;
}

function getLookupRecords(columnKey: RowField, lookupData: LookupData) {
  const lookup = RAW_LITHO_LOOKUP_BY_FIELD[columnKey];

  return lookup ? (lookup.options ?? lookupData[columnKey] ?? []) : null;
}

/* A lookup cell with no values to choose from is disabled in the table. */
function isEditableColumn(columnKey: RowField, lookupData: LookupData) {
  const records = getLookupRecords(columnKey, lookupData);

  return records === null || records.length > 0;
}

/*
 * The value a pasted text becomes in `columnKey`, or null when the cell would
 * reject it. Lookup codes are matched case-insensitively and stored with the
 * lookup's own spelling, as picking a suggestion would. Comments are kept
 * with internal/trailing spaces intact; codes and depths are trimmed.
 */
function toCellValue(columnKey: RowField, text: string, lookupData: LookupData) {
  const lookup = RAW_LITHO_LOOKUP_BY_FIELD[columnKey];

  if (lookup) {
    const code = normalizeLookupCode(text);
    if (!code) return "";

    const match = getLookupRecords(columnKey, lookupData)?.find(
      (record) => normalizeLookupCode(record?.[lookup.codeProperty]) === code,
    )?.[lookup.codeProperty];

    return typeof match === "string" ? match.trim() : null;
  }

  if (COMMENT_FIELD_KEYS.has(columnKey)) return normalizeFieldValue(columnKey, text);

  const value = text.trim();
  const isNumber = tableColumns.some(
    (column) => column.key === columnKey && column.type === "number",
  );

  return isNumber && value !== "" && !isValidDepth(value) ? null : value;
}

function buildEdit(
  cell: CellRef,
  text: string,
  lookupData: LookupData,
): CellEdit | PasteIssue {
  const value = toCellValue(cell.columnKey, text, lookupData);
  if (value !== null) return { ...cell, value };

  return RAW_LITHO_LOOKUP_BY_FIELD[cell.columnKey]
    ? "invalidLookupValue"
    : "invalidPasteValue";
}

function collectEdits(items: (CellEdit | PasteIssue)[]): PastePlan {
  const issue = items.find((item) => typeof item === "string");
  if (issue) return { issue };

  return { edits: items.filter((item) => typeof item !== "string") };
}

/*
 * Maps clipboard cells onto table cells. Nothing is applied here, so a paste
 * that fails any check changes nothing.
 *
 *   one target cell                  top-left corner of the pasted block
 *   several targets, one value       the value fills every editable target
 *   several targets, several values  the targets must form a rectangle of
 *                                    exactly the clipboard's shape
 *
 * The block never extends past the last row or column: paste does not create
 * rows. A disabled cell inside the block rejects the whole paste.
 */
export function planPaste(
  rows: RawLithoRow[],
  targets: CellRef[],
  grid: string[][],
  lookupData: LookupData,
): PastePlan {
  const singleValue = isTabularClipboard(grid) ? null : (grid[0]?.[0] ?? "");

  if (targets.length > 1 && singleValue !== null) {
    const editable = targets.filter((cell) =>
      isEditableColumn(cell.columnKey, lookupData),
    );
    if (editable.length === 0) return { issue: "pasteNotEditable" };

    return collectEdits(
      editable.map((cell) => buildEdit(cell, singleValue, lookupData)),
    );
  }

  const positions = locateCells(rows, targets);
  if (positions.length === 0) return { edits: [] };

  const bounds = getBounds(positions);
  const gridWidth = Math.max(...grid.map((line) => line.length));

  if (
    positions.length > 1 &&
    (bounds.height !== grid.length ||
      bounds.width !== gridWidth ||
      positions.length !== grid.length * gridWidth)
  ) {
    return { issue: "pasteShapeMismatch" };
  }

  if (
    bounds.top + grid.length > rows.length ||
    bounds.left + gridWidth > COLUMN_KEYS.length
  ) {
    return { issue: "pasteOutOfRange" };
  }

  const items = grid.flatMap((line, rowOffset) =>
    line.map((text, columnOffset) => {
      const row = rows[bounds.top + rowOffset];
      const columnKey = COLUMN_KEYS[bounds.left + columnOffset];
      if (!row || !columnKey) return "pasteOutOfRange";
      if (!isEditableColumn(columnKey, lookupData)) return "pasteNotEditable";

      return buildEdit({ rowId: String(row.id), columnKey }, text, lookupData);
    }),
  );

  return collectEdits(items);
}
