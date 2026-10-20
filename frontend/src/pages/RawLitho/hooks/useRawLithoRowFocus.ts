import type { RawLithoRow, RowId } from "../../../types/domain";
import { useCallback, useEffect, useRef } from "react";
import {
  focusCellInRow,
  getColumnKeyFromElement,
  getRowIdFromElement,
  hasLostFocus,
} from "../tableNavigation";
import { findRowPage } from "../rawLithoSorting";

interface FocusRequest {
  rowId: RowId;
  columnKey: string | null;
}




/*
 * Keeps the caret attached to a logical row rather than to a table position.
 *
 * Rows are reordered by Litho From, so a row the user is editing can change
 * index — and can move to another page. Everything here addresses rows by their
 * stable `row.id`.
 *
 * Two focus paths:
 *   requestFocus(rowId, columnKey)  focus after the next render (a new row that
 *                                   does not exist in the DOM yet)
 *   focusRowCell(rowId, columnKey)  focus now, switching page first if the row
 *                                   is not on the current one
 *
 * On top of that, a reorder that drops focus restores it to the cell the user
 * was last in.
 */
export function useRawLithoRowFocus({
  tableBodyRef,
  rows,
  currentPage,
  rowsPerPage,
  onPageChange,
}: {
  tableBodyRef: React.RefObject<HTMLTableSectionElement | null>;
  rows: RawLithoRow[];
  currentPage: number;
  rowsPerPage: number;
  onPageChange: (page: number) => void;
}) {
  const pendingFocus = useRef<FocusRequest | null>(null);
  const lastFocusedCell = useRef<FocusRequest | null>(null);
  const previousRowOrder = useRef<string | null>(null);

  const focusRowCell = useCallback(
    (rowId: RowId, columnKey: string | null = null) => {
      if (focusCellInRow(tableBodyRef.current, rowId, columnKey)) return true;

      // Not rendered: find the page holding it and try again after the switch.
      const page = findRowPage(rows, rowId, rowsPerPage);
      if (!page || page === currentPage) return false;

      pendingFocus.current = { rowId, columnKey };
      onPageChange(page);
      return false;
    },
    [currentPage, onPageChange, rows, rowsPerPage, tableBodyRef],
  );

  const requestFocus = useCallback(
    (rowId: RowId, columnKey: string | null = null) => {
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

  useEffect(() => {
    const focusRequest = pendingFocus.current;
    if (!focusRequest) return;

    pendingFocus.current = null;
    focusRowCell(focusRequest.rowId, focusRequest.columnKey);
  }, [focusRowCell]);

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

  return { focusRowCell, requestFocus, handleTableFocus };
}
