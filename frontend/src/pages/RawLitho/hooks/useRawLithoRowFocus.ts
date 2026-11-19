import type { RawLithoRow, RowId } from "../../../types/domain";
import { useCallback, useEffect, useRef } from "react";
import {
  focusCellInRow,
  getColumnKeyFromElement,
  getRowIdFromElement,
  hasLostFocus,
} from "../tableNavigation";

interface FocusRequest {
  rowId: RowId;
  columnKey: string | null;
}




// Renders to wait for a scrolled-to row before giving up on focusing it.
const MAX_FOCUS_ATTEMPTS = 5;

/*
 * Keeps the caret attached to a logical row rather than to a table position.
 *
 * Rows are reordered by Litho From, so a row the user is editing can change
 * index — and can scroll out of the rendered (virtualized) window. Everything
 * here addresses rows by their stable `row.id`.
 *
 * Two focus paths:
 *   requestFocus(rowId, columnKey)  focus after the next render (a new row that
 *                                   does not exist in the DOM yet)
 *   focusRowCell(rowId, columnKey)  focus now, scrolling the row into the
 *                                   rendered window first when it is not in it
 *
 * On top of that, a reorder that drops focus restores it to the cell the user
 * was last in.
 */
export function useRawLithoRowFocus({
  tableBodyRef,
  rows,
  scrollToRowIndex,
}: {
  tableBodyRef: React.RefObject<HTMLTableSectionElement | null>;
  rows: RawLithoRow[];
  /* Brings the row at this index into the rendered window. */
  scrollToRowIndex: (index: number) => void;
}) {
  const pendingFocus = useRef<FocusRequest | null>(null);
  const attempts = useRef(0);
  const lastFocusedCell = useRef<FocusRequest | null>(null);
  const previousRowOrder = useRef<string | null>(null);

  const focusRowCell = useCallback(
    (rowId: RowId, columnKey: string | null = null) => {
      if (focusCellInRow(tableBodyRef.current, rowId, columnKey)) {
        attempts.current = 0;
        return true;
      }

      // Not rendered: scroll it into the window and try again after rendering.
      const index = rows.findIndex((row) => String(row.id) === String(rowId));
      // A new target restarts the count; retries of the same one are capped.
      if (String(pendingFocus.current?.rowId) !== String(rowId)) attempts.current = 0;
      if (index === -1 || attempts.current >= MAX_FOCUS_ATTEMPTS) {
        attempts.current = 0;
        pendingFocus.current = null;
        return false;
      }

      attempts.current += 1;
      pendingFocus.current = { rowId, columnKey };
      scrollToRowIndex(index);
      return false;
    },
    [rows, scrollToRowIndex, tableBodyRef],
  );

  const requestFocus = useCallback(
    (rowId: RowId, columnKey: string | null = null) => {
      attempts.current = 0;
      pendingFocus.current = { rowId, columnKey };
    },
    [],
  );

  /* Bind to the table body's onFocus to remember where the user is. */
  const handleTableFocus = useCallback(
    (event: React.FocusEvent<HTMLTableSectionElement>) => {
      const rowId = getRowIdFromElement(event.target);
      const columnKey = getColumnKeyFromElement(event.target);

      if (rowId === null || !columnKey) return;

      lastFocusedCell.current = { rowId, columnKey };
    },
    [],
  );

  // After every render: a requested row may have just been rendered (a new
  // row, or one the virtualized table has scrolled to).
  useEffect(() => {
    const focusRequest = pendingFocus.current;
    if (!focusRequest) return;

    pendingFocus.current = null;
    focusRowCell(focusRequest.rowId, focusRequest.columnKey);
  });

  useEffect(() => {
    const rowOrder = rows.map((row) => row.id).join("|");
    const previousOrder = previousRowOrder.current;

    previousRowOrder.current = rowOrder;

    // Nothing moved, first render, or a more specific request is already queued.
    if (previousOrder === null || previousOrder === rowOrder) return;
    if (pendingFocus.current) return;

    // Focus that moved somewhere deliberate is left alone.
    if (!hasLostFocus()) return;

    const target = lastFocusedCell.current;
    if (!target) return;

    focusRowCell(target.rowId, target.columnKey);
  }, [focusRowCell, rows]);

  /*
   * The row a focus request is still scrolling to, if any. Keys pressed
   * before it renders (a held arrow key) move on from there, not from the
   * row that still has the caret, so no key press is lost.
   */
  const getPendingRowId = useCallback(
    () => (pendingFocus.current ? String(pendingFocus.current.rowId) : null),
    [],
  );

  return { focusRowCell, requestFocus, handleTableFocus, getPendingRowId };
}
