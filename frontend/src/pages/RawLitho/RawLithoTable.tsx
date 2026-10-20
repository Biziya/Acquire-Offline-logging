import type {
  RawLithoRow as RawLithoRowRecord,
  RowField,
  LookupData,
  LookupStatuses,
  RowChange,
  AddRowResult,
  Notify,
} from "../../types/domain";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import RawLithoRow from "./RawLithoRow";
import { useRawLithoShortcuts } from "./hooks/useRawLithoShortcuts";
import { useRawLithoRowFocus } from "./hooks/useRawLithoRowFocus";
import {
  focusCellInRow,
  getHorizontalStep,
  getRowIdFromElement,
  isKeyAlreadyHandled,
  isRowCreationKey,
} from "./tableNavigation";
import {
  buildClipboardText,
  getCellRef,
  isSameCell,
  isTabularClipboard,
  parseClipboardText,
  planPaste,
  type CellEdit,
  type CellRef,
} from "./rawLithoClipboard";
import { findDuplicateIntervalRowIds } from "./rawLithoValidation";
import {
  INDEX_COLUMN_WIDTH,
  RAW_LITHO_ROWS_PER_PAGE,
  REQUIRED_COLUMN_KEYS,
  TOAST_NOTIFICATIONS,
  tableColumns,
} from "./constants";
import {
  HEADER_CELL,
  TABLE,
  TABLE_FRAME,
} from "../../components/dataTableStyles";
import { rawLithoConfig } from "./config";
import {
  OUTLINE_BUTTON,
  OUTLINE_BUTTON_DISABLED,
  OUTLINE_BUTTON_NAVY,
} from "./rawLithoStyles";

interface RawLithoTableProps {
  rows: RawLithoRowRecord[];
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  lookupData: LookupData;
  lookupStatus: LookupStatuses;
  onRowChange: RowChange;
  onDepthCommit: RowChange;
  onPasteCells: (edits: CellEdit[]) => void;
  showToast: Notify;
  onAddRow: () => AddRowResult;
  onRemoveLastRow: () => void;
  isEnabled: boolean;
  isBlocked?: boolean;
}

const FALLBACK_FOCUS_FIELD = "lithoTo";
const FIRST_COLUMN_KEY = tableColumns[0]?.key ?? null;
const LAST_COLUMN_KEY = tableColumns[tableColumns.length - 1]?.key ?? null;

const PAGINATION_BUTTON = `${OUTLINE_BUTTON} ${OUTLINE_BUTTON_NAVY} ${OUTLINE_BUTTON_DISABLED} h-7 min-w-[76px] px-2.5 text-[0.8rem] max-sm:min-w-0`;
const ROW_ACTION_BUTTON = `${OUTLINE_BUTTON} ${OUTLINE_BUTTON_DISABLED} h-7 px-3 text-[0.8rem]`;

function RawLithoTable({
  rows,
  currentPage,
  totalPages,
  onPageChange,
  lookupData,
  lookupStatus,
  onRowChange,
  onDepthCommit,
  onPasteCells,
  showToast,
  onAddRow,
  onRemoveLastRow,
  isEnabled,
  isBlocked = false,
}: RawLithoTableProps) {
  const tableWrapperRef = useRef<HTMLDivElement>(null);
  const tableBodyRef = useRef<HTMLTableSectionElement>(null);
  // Ctrl + click selection, by row id and column key so it survives sorting.
  const [selectedCells, setSelectedCells] = useState<CellRef[]>([]);

  const pageStartIndex = (currentPage - 1) * RAW_LITHO_ROWS_PER_PAGE;
  const visibleRows = useMemo(
    () => rows.slice(pageStartIndex, pageStartIndex + RAW_LITHO_ROWS_PER_PAGE),
    [pageStartIndex, rows],
  );
  const duplicateRowIds = useMemo(
    () => findDuplicateIntervalRowIds(rows),
    [rows],
  );
  const selectedColumnsByRow = useMemo(() => {
    const columnsByRow = new Map<string, Set<RowField>>();

    selectedCells.forEach(({ rowId, columnKey }) => {
      const columnKeys = columnsByRow.get(rowId) ?? new Set<RowField>();

      columnKeys.add(columnKey);
      columnsByRow.set(rowId, columnKeys);
    });

    return columnsByRow;
  }, [selectedCells]);
  const firstVisibleRow = rows.length === 0 ? 0 : pageStartIndex + 1;
  const lastVisibleRow = Math.min(
    pageStartIndex + visibleRows.length,
    rows.length,
  );

  // The final row always lives on the final page.
  const isLastRowVisible = currentPage === totalPages;
  const canRemoveLastRow = isEnabled && rows.length > 1;

  useEffect(() => {
    if (tableWrapperRef.current) {
      tableWrapperRef.current.scrollTop = 0;
    }
  }, [currentPage]);

  /*
   * Ctrl + click toggles a cell in the selection and focuses it, so Ctrl + C /
   * Ctrl + V reach the table. A plain click anywhere outside the selection
   * clears it. Listening on the document covers clicks outside the table too.
   */
  useEffect(() => {
    function handleMouseDown(event: MouseEvent) {
      if (event.button !== 0) return;

      const tbody = tableBodyRef.current;
      const cell =
        tbody && event.target instanceof Node && tbody.contains(event.target)
          ? getCellRef(event.target)
          : null;

      if (!event.ctrlKey && !event.metaKey) {
        setSelectedCells((current) =>
          current.length === 0 ||
          (cell && current.some((item) => isSameCell(item, cell)))
            ? current
            : [],
        );
        return;
      }

      if (!cell) return;

      event.preventDefault();
      setSelectedCells((current) =>
        current.some((item) => isSameCell(item, cell))
          ? current.filter((item) => !isSameCell(item, cell))
          : [...current, cell],
      );
      focusCellInRow(tbody, cell.rowId, cell.columnKey);
    }

    document.addEventListener("mousedown", handleMouseDown);
    return () => document.removeEventListener("mousedown", handleMouseDown);
  }, []);

  const { focusRowCell, requestFocus, handleTableFocus } = useRawLithoRowFocus({
    tableBodyRef,
    rows,
    currentPage,
    rowsPerPage: RAW_LITHO_ROWS_PER_PAGE,
    onPageChange,
  });

  /*
   * Every route into row creation goes through here: the Add Row button, F4,
   * Tab from the last cell and ArrowDown from the last row. `onAddRow` owns the
   * validation; this function owns only where the caret ends up.
   *
   * Both branches address the row by id, because the new row is sorted into
   * position by Litho From and is not necessarily the last row.
   */
  const requestAddRow = useCallback(() => {
    const result = onAddRow();

    if (result?.created) {
      requestFocus(result.rowId);
      return result;
    }

    // Focus locks onto the invalid cell, changing page if it is out of view.
    if (result?.rowId === undefined) return result;

    focusRowCell(result.rowId, result.focusField ?? FALLBACK_FOCUS_FIELD);
    return result;
  }, [focusRowCell, onAddRow, requestFocus]);

  useRawLithoShortcuts({
    isEnabled,
    isBlocked,
    currentPage,
    totalPages,
    canRemoveLastRow,
    onAddRow: requestAddRow,
    onRemoveLastRow,
    onPageChange,
  });

  /*
   * Tab / Shift + Tab / ArrowRight / ArrowLeft at the edge of the rendered page:
   * the cell handler found no neighbour, so continue in the adjacent row on the
   * next or previous page. Returns false at either end of the document.
   */
  function focusAdjacentPageRow(element: EventTarget, step: number) {
    const rowId = getRowIdFromElement(element);
    const index = rows.findIndex((row) => String(row.id) === rowId);
    const target = index === -1 ? undefined : rows[index + step];

    if (!target) return false;

    focusRowCell(target.id, step > 0 ? FIRST_COLUMN_KEY : LAST_COLUMN_KEY);
    return true;
  }

  function handleTableKeyDown(
    event: React.KeyboardEvent<HTMLTableSectionElement>,
  ) {
    if (event.key === "Escape") setSelectedCells([]);

    if (!isEnabled || isBlocked) return;

    // A cell handler (arrow navigation, lookup dropdown) already used this key.
    if (isKeyAlreadyHandled(event)) return;

    const step = getHorizontalStep(event);

    if (step !== 0 && focusAdjacentPageRow(event.target, step)) {
      event.preventDefault();
      return;
    }

    // Only the final page ends at the final row of the document.
    if (!isLastRowVisible) return;
    if (!isRowCreationKey(event, tableBodyRef.current)) return;

    event.preventDefault();
    requestAddRow();
  }

  /* With cells selected, Ctrl + C copies them; otherwise the input's own text. */
  function handleCopy(event: React.ClipboardEvent<HTMLTableSectionElement>) {
    if (selectedCells.length === 0) return;

    event.preventDefault();

    try {
      event.clipboardData.setData(
        "text/plain",
        buildClipboardText(rows, selectedCells),
      );
      showToast(TOAST_NOTIFICATIONS.cellsCopied);
    } catch {
      showToast(TOAST_NOTIFICATIONS.clipboardUnavailable);
    }
  }

  /*
   * Ctrl + V into the selection, or into the focused cell when the clipboard
   * holds several cells (copied from Excel). A single value pasted without a
   * selection is left to the input, so ordinary text paste is unchanged.
   */
  function handlePaste(event: React.ClipboardEvent<HTMLTableSectionElement>) {
    if (!isEnabled || isBlocked) return;

    let text: string;

    try {
      text = event.clipboardData.getData("text/plain");
    } catch {
      if (selectedCells.length === 0) return;

      event.preventDefault();
      showToast(TOAST_NOTIFICATIONS.clipboardUnavailable);
      return;
    }

    const grid = parseClipboardText(text);
    const focusedCell = getCellRef(event.target);

    if (selectedCells.length === 0 && !isTabularClipboard(grid)) return;

    const targets =
      selectedCells.length > 0
        ? selectedCells
        : focusedCell
          ? [focusedCell]
          : [];
    if (targets.length === 0) return;

    event.preventDefault();
    if (text === "") return;

    const plan = planPaste(rows, targets, grid, lookupData);

    if ("issue" in plan) {
      showToast(TOAST_NOTIFICATIONS[plan.issue]);
      return;
    }

    onPasteCells(plan.edits);
  }

  return (
    <div className="flex min-h-0 w-full min-w-0 flex-1 flex-col">
      <div ref={tableWrapperRef} className={`${TABLE_FRAME} scroll-smooth`}>
        <table className={TABLE} style={{ minWidth: rawLithoConfig.minWidth }}>
          <thead>
            <tr>
              <th className={HEADER_CELL} style={{ width: INDEX_COLUMN_WIDTH }}>
                Ins
              </th>

              {tableColumns.map((column) => {
                const isRequired = REQUIRED_COLUMN_KEYS.has(column.key);

                return (
                  <th
                    key={column.key}
                    className={HEADER_CELL}
                    style={{ width: column.width }}
                  >
                    {column.label}
                    {isRequired && (
                      <abbr
                        className="ml-px cursor-help text-[0.85em] font-bold text-rl-required no-underline"
                        title="Required field"
                      >
                        *
                      </abbr>
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>

          <tbody
            ref={tableBodyRef}
            onKeyDown={handleTableKeyDown}
            onFocus={handleTableFocus}
            onCopy={handleCopy}
            onPaste={handlePaste}
          >
            {visibleRows.map((row, pageRowIndex) => (
              <RawLithoRow
                key={row.id}
                row={row}
                rowIndex={pageStartIndex + pageRowIndex}
                lookupData={lookupData}
                lookupStatus={lookupStatus}
                onRowChange={onRowChange}
                onDepthCommit={onDepthCommit}
                isEnabled={isEnabled}
                hasDuplicateInterval={duplicateRowIds.has(row.id)}
                selectedColumns={selectedColumnsByRow.get(String(row.id))}
              />
            ))}
          </tbody>
        </table>
      </div>

      <nav
        className="flex items-center justify-center gap-3 pt-2 max-sm:gap-2"
        aria-label="Raw Litho table pages"
      >
        <button
          className={PAGINATION_BUTTON}
          type="button"
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage <= 1}
          aria-label={`Show previous ${RAW_LITHO_ROWS_PER_PAGE} Raw Litho rows (PageUp)`}
        >
          Previous
        </button>

        <div
          className="grid min-w-[140px] gap-px text-center text-[0.8rem] font-semibold text-rl-text"
          aria-live="polite"
        >
          <span>
            Page {currentPage} of {totalPages}
          </span>
          <span className="text-[0.75rem] font-normal text-rl-text-muted">
            Rows {firstVisibleRow}–{lastVisibleRow} of {rows.length}
          </span>
        </div>

        <button
          className={PAGINATION_BUTTON}
          type="button"
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage >= totalPages}
          aria-label={`Show next ${RAW_LITHO_ROWS_PER_PAGE} Raw Litho rows (PageDown)`}
        >
          Next
        </button>
      </nav>

      <div className="mt-2 flex gap-2">
        {/*
          Stays clickable while the page is enabled: `requestAddRow` is what
          reports the missing fields or the duplicate interval, so disabling the
          button would hide the reason the row was rejected.
        */}
        <button
          className={`${ROW_ACTION_BUTTON} ${OUTLINE_BUTTON_NAVY}`}
          type="button"
          onClick={requestAddRow}
          disabled={!isEnabled}
          title="Add Row (F4)"
        >
          Add Row (F4)
        </button>

        <button
          className={`${ROW_ACTION_BUTTON} text-rl-danger enabled:hover:border-rl-danger enabled:hover:bg-rl-danger enabled:hover:text-white enabled:active:bg-rl-danger-dark`}
          type="button"
          onClick={onRemoveLastRow}
          disabled={!canRemoveLastRow}
          title="Remove Last Row (F5)"
        >
          Remove Last Row (F5)
        </button>
      </div>
    </div>
  );
}

export default RawLithoTable;
