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
  getEditableElements,
  getColumnKeyFromElement,
  getHorizontalStep,
  getRowIdFromElement,
  handleCellNavigation,
  isKeyAlreadyHandled,
  isLastRowArrowDown,
  markKeyAsHandled,
} from "./tableNavigation";
import {
  buildClipboardText,
  getCellRange,
  getCellRef,
  getRowCells,
  isSameCell,
  isTabularClipboard,
  parseClipboardText,
  planPaste,
  type CellEdit,
  type CellRef,
} from "./rawLithoClipboard";
import { findOverlappingIntervalRowIds } from "./rawLithoValidation";
import ConfirmDialog from "../../components/ConfirmDialog";
import type { RowId } from "../../types/domain";
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
  REQUIRED_MARK,
  TABLE_FRAME,
} from "../../components/dataTableStyles";
import { rawLithoConfig } from "./config";
import { DANGER_BUTTON, SECONDARY_BUTTON } from "../../components/uiStyles";

// The keyboard shortcut shown inside a button, for sighted users only (the
// button's title names it for everyone).
function KeyHint({ children }: { children: string }) {
  return (
    <kbd aria-hidden="true" className="ml-1.5 rounded-sm border border-current/25 px-1 font-sans text-[0.75rem] font-normal opacity-70">
      {children}
    </kbd>
  );
}

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
  /*
   * Deleting ticked rows / clearing selected cells. Both are confirmed in a
   * dialog first; they resolve true once the change is saved as a draft.
   * Without them the row checkboxes and the bulk Delete are not offered.
   */
  onRemoveRows?: (rowIds: RowId[]) => Promise<boolean>;
  onClearCells?: (cells: CellRef[]) => Promise<boolean>;
  isEnabled: boolean;
  isBlocked?: boolean;
  /* Rendered at the right end of the bar under the table (Save). */
  footerEnd?: React.ReactNode;
}

const FALLBACK_FOCUS_FIELD = "lithoTo";
const FIRST_COLUMN_KEY = tableColumns[0]?.key ?? null;
const LAST_COLUMN_KEY = tableColumns[tableColumns.length - 1]?.key ?? null;

const PAGINATION_BUTTON = `${SECONDARY_BUTTON} min-w-[76px] max-sm:min-w-0`;

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
  onRemoveRows,
  onClearCells,
  isEnabled,
  isBlocked: isBlockedOutside = false,
  footerEnd,
}: RawLithoTableProps) {
  const tableWrapperRef = useRef<HTMLDivElement>(null);
  const tableBodyRef = useRef<HTMLTableSectionElement>(null);
  const selectAllRef = useRef<HTMLInputElement>(null);
  const tabNavigationActive = useRef(true);
  // Ctrl / Shift + click selection, by row id and column key so it survives sorting.
  const [selectedCells, setSelectedCells] = useState<CellRef[]>([]);
  // Where Shift + click ranges start: the last cell clicked or focused.
  const anchorCell = useRef<CellRef | null>(null);
  // Ticked row checkboxes, by row id.
  const [checkedRowIds, setCheckedRowIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const [pendingDelete, setPendingDelete] = useState<
    | { kind: "rows"; rowIds: RowId[] }
    | { kind: "cells"; cells: CellRef[] }
    | null
  >(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const isBlocked = isBlockedOutside || pendingDelete !== null;
  const canSelectRows = Boolean(onRemoveRows);

  // Ticked rows that no longer exist (deleted, new drillhole) drop out.
  const rowIdSet = useMemo(() => new Set(rows.map((row) => String(row.id))), [rows]);
  const checkedIds = useMemo(
    () => rows.filter((row) => checkedRowIds.has(String(row.id))).map((row) => row.id),
    [checkedRowIds, rows],
  );
  const allChecked = rows.length > 0 && checkedIds.length === rows.length;

  useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate = checkedIds.length > 0 && !allChecked;
    }
  }, [allChecked, checkedIds.length]);

  useEffect(() => {
    setSelectedCells((current) => {
      const kept = current.filter((cell) => rowIdSet.has(cell.rowId));
      return kept.length === current.length ? current : kept;
    });
  }, [rowIdSet]);

  const toggleRowChecked = useCallback((rowId: RowId) => {
    setCheckedRowIds((current) => {
      const next = new Set(current);
      const key = String(rowId);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const selectWholeRow = useCallback((rowId: RowId) => {
    const cells = getRowCells(String(rowId));
    setSelectedCells(cells);
    anchorCell.current = cells[0] ?? null;
    setCheckedRowIds((current) => new Set(current).add(String(rowId)));
  }, []);

  function toggleAllRows() {
    setCheckedRowIds(
      allChecked ? new Set() : new Set(rows.map((row) => String(row.id))),
    );
  }

  function requestDeleteRows() {
    if (!onRemoveRows || !isEnabled || isBlocked || checkedIds.length === 0) return;
    setPendingDelete({ kind: "rows", rowIds: checkedIds });
  }

  /*
   * Delete with several cells selected asks to clear them. When the selection
   * is exactly whole ticked rows (double-click on a row number), it asks to
   * delete those rows instead.
   */
  function requestDeleteSelection() {
    if (!isEnabled || isBlocked) return false;

    const selectedRowIds = [...new Set(selectedCells.map((cell) => cell.rowId))];
    const isWholeCheckedRows =
      selectedRowIds.length > 0 &&
      selectedRowIds.every(
        (rowId) =>
          checkedRowIds.has(rowId) &&
          getRowCells(rowId).every((cell) =>
            selectedCells.some((item) => isSameCell(item, cell)),
          ),
      );

    if (isWholeCheckedRows && onRemoveRows) {
      setPendingDelete({ kind: "rows", rowIds: checkedIds });
      return true;
    }
    if (selectedCells.length > 1 && onClearCells) {
      setPendingDelete({ kind: "cells", cells: selectedCells });
      return true;
    }
    return false;
  }

  /* Delete key: a cell selection first, then ticked rows from a row checkbox. */
  function requestBulkDelete(target: EventTarget) {
    if (requestDeleteSelection()) return true;

    const onRowCheckbox =
      target instanceof Element && target.matches("[data-row-select]");
    if (!onRowCheckbox || checkedIds.length === 0 || !onRemoveRows) return false;
    if (!isEnabled || isBlocked) return false;

    requestDeleteRows();
    return true;
  }

  async function confirmDelete() {
    if (!pendingDelete || isDeleting) return;
    setIsDeleting(true);

    let succeeded: boolean;
    try {
      succeeded =
        pendingDelete.kind === "rows"
          ? ((await onRemoveRows?.(pendingDelete.rowIds)) ?? false)
          : ((await onClearCells?.(pendingDelete.cells)) ?? false);
    } catch {
      succeeded = false;
    }

    setIsDeleting(false);
    if (succeeded) {
      if (pendingDelete.kind === "rows") setCheckedRowIds(new Set());
      setSelectedCells([]);
    }
    setPendingDelete(null);
    showToast(
      !succeeded
        ? TOAST_NOTIFICATIONS.deleteFailed
        : pendingDelete.kind === "rows"
          ? TOAST_NOTIFICATIONS.rowsRemoved
          : TOAST_NOTIFICATIONS.cellsCleared,
    );
  }

  function cancelDelete() {
    if (!isDeleting) setPendingDelete(null);
  }

  const pageStartIndex = (currentPage - 1) * RAW_LITHO_ROWS_PER_PAGE;
  const visibleRows = useMemo(
    () => rows.slice(pageStartIndex, pageStartIndex + RAW_LITHO_ROWS_PER_PAGE),
    [pageStartIndex, rows],
  );
  const overlappingRowIds = useMemo(
    () => findOverlappingIntervalRowIds(rows),
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

  // Read by the document listener below, which is registered once.
  const rowsRef = useRef(rows);
  rowsRef.current = rows;

  /*
   * Ctrl + click toggles a cell in the selection and focuses it, so Ctrl + C /
   * Ctrl + V reach the table. Shift + click selects the rectangle from the
   * last clicked or focused cell (Ctrl + Shift adds it to the selection). A
   * plain click anywhere outside the selection clears it. Listening on the
   * document covers clicks outside the table too.
   */
  useEffect(() => {
    function handleMouseDown(event: MouseEvent) {
      if (event.button !== 0) return;

      const tbody = tableBodyRef.current;
      const cell =
        tbody && event.target instanceof Node && tbody.contains(event.target)
          ? getCellRef(event.target)
          : null;

      if (event.shiftKey && cell) {
        event.preventDefault();
        const anchor = anchorCell.current ?? cell;
        const range = getCellRange(rowsRef.current, anchor, cell);
        const additive = event.ctrlKey || event.metaKey;
        setSelectedCells((current) =>
          additive
            ? [...current, ...range.filter((item) => !current.some((existing) => isSameCell(existing, item)))]
            : range,
        );
        focusCellInRow(tbody, cell.rowId, cell.columnKey);
        // Focusing the clicked cell must not move the range's start.
        anchorCell.current = anchor;
        return;
      }

      if (!event.ctrlKey && !event.metaKey) {
        if (cell) anchorCell.current = cell;
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
      anchorCell.current = cell;
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
   * Tab from the final editable cell and ArrowDown from the last row. `onAddRow` owns the
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
   * next or previous page. Shift + Tab stops at the first editable cell;
   * forward Tab at the final cell reaches the shared row-creation path.
   */
  function focusAdjacentPageRow(element: EventTarget, step: number) {
    const rowId = getRowIdFromElement(element);
    const sourceCell = element instanceof Element ? element.closest("td") : null;
    const index = rows.findIndex((row) => String(row.id) === rowId);
    if (index === -1) return false;

    for (let distance = 1; distance <= rows.length; distance += 1) {
      const position = index + step * distance;
      if (position < 0 || position >= rows.length) return false;
      const target = rows[position];
      if (!target) return false;
      const rendered = Array.from(tableBodyRef.current?.rows ?? []).find(
        row => row.dataset.rowId === String(target.id),
      );
      if (rendered) {
        const editables = getEditableElements(rendered);
        const input = step > 0 ? editables[0] : editables.at(-1);
        if (!input || input.closest("td") === sourceCell) continue;
        focusRowCell(target.id, getColumnKeyFromElement(input));
      } else {
        focusRowCell(target.id, step > 0 ? FIRST_COLUMN_KEY : LAST_COLUMN_KEY);
      }
      return true;
    }
    return false;
  }

  function handleTableKeyDown(
    event: React.KeyboardEvent<HTMLTableSectionElement>,
  ) {
    if (event.key === "Escape") setSelectedCells([]);

    if (!isEnabled || isBlocked) return;

    // A cell handler (arrow navigation, lookup dropdown) already used this key.
    if (isKeyAlreadyHandled(event)) return;
    // Secondary controls and wrappers may not have their own cell handler.
    // Resolve them from the same logical cell before considering page edges.
    if (handleCellNavigation(event)) return;

    const step = getHorizontalStep(event);

    const tbody = tableBodyRef.current;
    const sourceCell = event.target instanceof Element ? event.target.closest("td") : null;
    const editors = step !== 0 && tbody ? getEditableElements(tbody) : [];
    const isEditableCell = Boolean(sourceCell && editors.some(editor => editor.closest("td") === sourceCell));
    if (step !== 0 && isEditableCell &&
        focusAdjacentPageRow(event.target, step)) {
      event.preventDefault();
      markKeyAsHandled(event);
      return;
    }

    if (event.key === "Tab" && step < 0 && isEditableCell) {
      // No previous editable cell exists. Prevent native browser navigation
      // without changing focus or wrapping to the table's end. Esc still exits.
      event.preventDefault();
      markKeyAsHandled(event);
      return;
    }

    // Only the final page ends at the final row of the document.
    if (!isLastRowVisible) return;
    const isFinalCellTab = event.key === "Tab" && step === 1 && isEditableCell &&
      editors.at(-1)?.closest("td") === sourceCell;
    if (!isFinalCellTab && !isLastRowArrowDown(event, tbody)) return;

    event.preventDefault();
    markKeyAsHandled(event);
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

  const deleteDialog = pendingDelete && (() => {
    if (pendingDelete.kind === "rows") {
      const count = pendingDelete.rowIds.length;
      const ids = new Set(pendingDelete.rowIds.map(String));
      const numbers = rows.flatMap((row, index) => (ids.has(String(row.id)) ? [index + 1] : []));
      return (
        <ConfirmDialog
          title={count === 1 ? "Delete 1 row?" : `Delete ${count} rows?`}
          message="The ticked rows and all their values will be deleted."
          facts={[["Rows", numbers.join(", ")]]}
          confirmLabel="Delete"
          busyLabel="Deleting…"
          isBusy={isDeleting}
          onConfirm={confirmDelete}
          onCancel={cancelDelete}
        />
      );
    }
    const count = pendingDelete.cells.length;
    const rowCount = new Set(pendingDelete.cells.map((cell) => cell.rowId)).size;
    return (
      <ConfirmDialog
        title={`Clear ${count} cells?`}
        message="The values in the selected cells will be removed. The rows stay."
        facts={[["Cells", String(count)], ["Rows", String(rowCount)]]}
        confirmLabel="Clear"
        busyLabel="Clearing…"
        isBusy={isDeleting}
        onConfirm={confirmDelete}
        onCancel={cancelDelete}
      />
    );
  })();

  return (
    <div className="flex min-h-0 w-full min-w-0 flex-1 flex-col">
      {deleteDialog}
      <div ref={tableWrapperRef} className={`${TABLE_FRAME} scroll-smooth`}>
        <table className={TABLE} style={{ minWidth: rawLithoConfig.minWidth }}>
          <thead>
            <tr>
              <th
                className={HEADER_CELL}
                style={{ width: INDEX_COLUMN_WIDTH }}
                title="Row number. Tick rows to delete them; double-click a number to select the whole row."
              >
                <span className="inline-flex items-center justify-center gap-1">
                  {canSelectRows && (
                    <input
                      ref={selectAllRef}
                      type="checkbox"
                      className="size-3 cursor-pointer accent-rl-navy"
                      tabIndex={-1}
                      checked={allChecked}
                      disabled={!isEnabled}
                      aria-label="Select all rows"
                      onChange={toggleAllRows}
                    />
                  )}
                  No.
                </span>
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
                        className={REQUIRED_MARK}
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
            onKeyDownCapture={(event) => {
              // Bulk Delete runs before the cell's own single-cell clear.
              if (event.key === "Delete" && !event.altKey && !event.ctrlKey &&
                  !event.metaKey && !event.shiftKey) {
                if (requestBulkDelete(event.target)) {
                  event.preventDefault();
                  event.stopPropagation();
                  markKeyAsHandled(event);
                  return;
                }
              }
              if (event.key === "Escape") tabNavigationActive.current = false;
              if (event.key === "Tab" && !tabNavigationActive.current) {
                // Explicitly leaving editing: skip cell handlers and allow the
                // browser default. This listener exists only on the table body.
                event.stopPropagation();
              }
            }}
            onMouseDownCapture={() => { tabNavigationActive.current = true; }}
            onKeyDown={handleTableKeyDown}
            onFocus={(event) => {
              if (!(event.relatedTarget instanceof Node) ||
                  !event.currentTarget.contains(event.relatedTarget)) {
                tabNavigationActive.current = true;
              }
              anchorCell.current = getCellRef(event.target) ?? anchorCell.current;
              handleTableFocus(event);
            }}
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
                hasOverlappingInterval={overlappingRowIds.has(row.id)}
                selectedColumns={selectedColumnsByRow.get(String(row.id))}
                isChecked={checkedRowIds.has(String(row.id))}
                onToggleChecked={canSelectRows ? toggleRowChecked : undefined}
                onSelectRow={selectWholeRow}
              />
            ))}
          </tbody>
        </table>
      </div>

      {/*
        One bar under the table: row actions on the left, pagination centred,
        and the page's own controls (Save JSON) on the right. Three columns
        keep the pagination centred; on narrow screens it takes its own
        centred line below the buttons instead of overflowing.
      */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 pt-2 lg:grid lg:grid-cols-[1fr_auto_1fr]">
        <div className="flex gap-4">
          {/*
            Stays clickable while the page is enabled: `requestAddRow` is what
            reports the missing fields or the overlapping interval, so disabling the
            button would hide the reason the row was rejected.
          */}
          <button
            className={SECONDARY_BUTTON}
            type="button"
            onClick={requestAddRow}
            disabled={!isEnabled}
            title="Add row (F4)"
          >
            Add row<KeyHint>F4</KeyHint>
          </button>

          <button
            className={DANGER_BUTTON}
            type="button"
            onClick={onRemoveLastRow}
            disabled={!canRemoveLastRow}
            title="Remove last row (F5)"
          >
            Remove last row<KeyHint>F5</KeyHint>
          </button>

          {canSelectRows && (
            <button
              className={DANGER_BUTTON}
              type="button"
              onClick={requestDeleteRows}
              disabled={!isEnabled || checkedIds.length === 0}
              title="Delete the ticked rows"
            >
              Delete selected{checkedIds.length > 0 ? ` (${checkedIds.length})` : ""}
            </button>
          )}
        </div>

        <nav
          className="flex items-center justify-center gap-3 max-lg:order-last max-lg:w-full max-sm:gap-2 lg:justify-self-center"
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
            className="grid min-w-[140px] gap-px text-center text-[0.8125rem] font-semibold text-rl-text"
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

        {footerEnd && (
          <div className="ml-auto flex items-center gap-2 lg:justify-self-end">
            {footerEnd}
          </div>
        )}
      </div>
    </div>
  );
}

export default RawLithoTable;
