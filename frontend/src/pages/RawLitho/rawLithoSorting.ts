import type { RawLithoRow, RawLithoDocument, RowId } from "../../types/domain";
import { isValidDepth } from "./rawLithoValidation";

/*
 * Row ordering for the Raw Litho table.
 *
 * Rows are ordered by Litho From ascending, then Litho To ascending when two
 * rows start at the same depth. Rows without a usable Litho From sink to the
 * bottom, so a freshly created or half-filled row never pushes a valid interval
 * down the table.
 *
 * Every caller uses `sortRowsByLithoFrom`; nothing sorts rows itself.
 */

/* Numeric depth, or null when the value is empty or not a number. */
function toDepth(value: unknown) {
  if (!isValidDepth(value)) return null;

  return Number(value);
}

/* Ascending, with null last. */
function compareDepths(left: number | null, right: number | null) {
  if (left === null && right === null) return 0;
  if (left === null) return 1;
  if (right === null) return -1;

  return left - right;
}

function compareRows(leftRow: RawLithoRow, rightRow: RawLithoRow) {
  const fromOrder = compareDepths(
    toDepth(leftRow.lithoFrom),
    toDepth(rightRow.lithoFrom),
  );

  if (fromOrder !== 0) return fromOrder;

  return compareDepths(toDepth(leftRow.lithoTo), toDepth(rightRow.lithoTo));
}

function isSameOrder(rows: RawLithoRow[], sortedRows: RawLithoRow[]) {
  return rows.every((row, index) => row === sortedRows[index]);
}

/*
 * Sorted copy of `rows`, or the original array when it is already in order.
 *
 * Returning the same reference lets callers skip the state update entirely, so
 * committing an edit that does not move anything causes no re-render, no focus
 * churn and no IndexedDB write.
 *
 * Whole row objects are moved, so every field travels with its row. Array#sort
 * is stable, which keeps rows that compare equal in their existing order.
 */
export function sortRowsByLithoFrom(rows: RawLithoRow[]) {
  if (rows.length < 2) return rows;

  const sortedRows = [...rows].sort(compareRows);

  return isSameOrder(rows, sortedRows) ? rows : sortedRows;
}

export function isRowOrderSorted(rows: RawLithoRow[]) {
  return sortRowsByLithoFrom(rows) === rows;
}

/*
 * Document-level variant used when rows arrive from outside the table (an
 * IndexedDB restore or a JSON import). Timestamps are left alone: reordering on
 * load is not a user edit.
 */
export function sortRawLithoDocumentRows(lithoDocument: RawLithoDocument) {
  const sortedRows = sortRowsByLithoFrom(lithoDocument.rows);

  if (sortedRows === lithoDocument.rows) return lithoDocument;

  return { ...lithoDocument, rows: sortedRows };
}

/* 1-based page holding `rowIndex`, given a page size. */
export function getPageForRowIndex(rowIndex: number, rowsPerPage: number) {
  if (rowIndex < 0) return 1;

  return Math.floor(rowIndex / rowsPerPage) + 1;
}

/* 1-based page holding the row with `rowId`, or null when it is not present. */
export function findRowPage(
  rows: RawLithoRow[],
  rowId: RowId,
  rowsPerPage: number,
) {
  const rowIndex = rows.findIndex((row) => String(row.id) === String(rowId));

  if (rowIndex === -1) return null;

  return getPageForRowIndex(rowIndex, rowsPerPage);
}
