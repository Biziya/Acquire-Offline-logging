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
  isEnabled,
  isBlocked = false,
  footerEnd,
}: RawLithoTableProps) {
  const tableWrapperRef = useRef<HTMLDivElement>(null);
  const tableBodyRef = useRef<HTMLTableSectionElement>(null);
  const tabNavigationActive = useRef(true);
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
                hasDuplicateInterval={duplicateRowIds.has(row.id)}
                selectedColumns={selectedColumnsByRow.get(String(row.id))}
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
            reports the missing fields or the duplicate interval, so disabling the
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
