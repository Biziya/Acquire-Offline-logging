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
  formatRowNumbers,
  getCellRange,
  getCellRef,
  getFullySelectedRowIds,
  getRowCells,
  getRowRange,
  isSameCell,
  mergeCells,
  isTabularClipboard,
  parseClipboardText,
  planPaste,
  type CellEdit,
  type CellRef,
} from "./rawLithoClipboard";
import { findOverlappingIntervalRowIds } from "./rawLithoValidation";
import ConfirmDialog from "../../components/ConfirmDialog";
import RawLithoSelectionBar from "./RawLithoSelectionBar";
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
import { SECONDARY_BUTTON } from "../../components/uiStyles";

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
  /*
   * Deleting selected rows / clearing selected cells. Both are confirmed in a
   * dialog first; they resolve true once the change is saved as a draft.
   * Without them the selection bar offers no Delete / Clear and F5 does
   * nothing.
   */
  onRemoveRows?: (rowIds: RowId[]) => Promise<boolean>;
  onClearCells?: (cells: CellRef[]) => Promise<boolean>;
  /* Offered as Undo in the toast after a delete or clear. */
  onUndo?: () => unknown;
  isEnabled: boolean;
  isBlocked?: boolean;
  /* Rendered at the right end of the bar under the table (Save). */
  footerEnd?: React.ReactNode;
}

const FALLBACK_FOCUS_FIELD = "lithoTo";
const FIRST_COLUMN_KEY = tableColumns[0]?.key ?? null;
const LAST_COLUMN_KEY = tableColumns[tableColumns.length - 1]?.key ?? null;

const PAGINATION_BUTTON = `${SECONDARY_BUTTON} min-w-[76px] max-sm:min-w-0`;

// Distance from the table's top / bottom edge where a drag scrolls it.
const AUTO_SCROLL_EDGE = 28;
const AUTO_SCROLL_STEP = 14;

/*
 * A mouse drag in progress. `cells`: started on a cell; it becomes a block
 * selection once the pointer reaches another cell (`active`), so a drag
 * inside one cell still selects that input's text. `rows`: started on a row
 * number; selects whole rows from the start. `base` is the selection kept
 * underneath (Ctrl adds the dragged block to it).
 */
type DragState =
  | { mode: "cells"; anchor: CellRef; last: CellRef; base: CellRef[]; active: boolean }
  | { mode: "rows"; anchorRowId: string; lastRowId: string; base: CellRef[] };

/* "20 – 35 m": smallest to largest depth of the rows, for the delete dialog. */
function describeDepthSpan(rows: readonly RawLithoRowRecord[]) {
  const depths = rows
    .flatMap((row) => [row.lithoFrom, row.lithoTo])
    .filter((value) => String(value ?? "").trim() !== "")
    .map(Number)
    .filter(Number.isFinite);
  if (depths.length === 0) return "";

  return `${Math.min(...depths)} – ${Math.max(...depths)} m`;
}

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
  onRemoveRows,
  onClearCells,
  onUndo,
  isEnabled,
  isBlocked: isBlockedOutside = false,
  footerEnd,
}: RawLithoTableProps) {
  const tableWrapperRef = useRef<HTMLDivElement>(null);
  const tableBodyRef = useRef<HTMLTableSectionElement>(null);
  const tabNavigationActive = useRef(true);
  // The one selection: cells by row id and column key, so it survives
  // sorting. A row counts as selected when every one of its cells is.
  const [selectedCells, setSelectedCells] = useState<CellRef[]>([]);
  // Where Shift + click ranges start: the last cell clicked or focused, and
  // the last row number clicked.
  const anchorCell = useRef<CellRef | null>(null);
  const anchorRowId = useRef<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<
    | { kind: "rows"; rowIds: RowId[] }
    | { kind: "cells"; cells: CellRef[] }
    | null
  >(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const isBlocked = isBlockedOutside || pendingDelete !== null;

  const rowIdSet = useMemo(() => new Set(rows.map((row) => String(row.id))), [rows]);

  // Cells of rows that no longer exist (deleted, new drillhole) drop out.
  useEffect(() => {
    setSelectedCells((current) => {
      const kept = current.filter((cell) => rowIdSet.has(cell.rowId));
      return kept.length === current.length ? current : kept;
    });
  }, [rowIdSet]);

  const fullRowIds = useMemo(
    () => getFullySelectedRowIds(rows, selectedCells),
    [rows, selectedCells],
  );
  const fullRowIdSet = useMemo(() => new Set(fullRowIds), [fullRowIds]);
  const selectedRowCount = useMemo(
    () => new Set(selectedCells.map((cell) => cell.rowId)).size,
    [selectedCells],
  );
  // The selection is whole rows and nothing else.
  const isWholeRowSelection =
    fullRowIds.length > 0 &&
    fullRowIds.length * tableColumns.length === selectedCells.length;

  function rowNumbersOf(rowIds: readonly (string | RowId)[]) {
    const ids = new Set(rowIds.map(String));
    return rows.flatMap((row, index) => (ids.has(String(row.id)) ? [index + 1] : []));
  }

  function requestDeleteRows(rowIds: RowId[] = fullRowIds) {
    if (!onRemoveRows || !isEnabled || isBlocked || rowIds.length === 0) return false;
    setPendingDelete({ kind: "rows", rowIds });
    return true;
  }

  function requestClearCells() {
    if (!onClearCells || !isEnabled || isBlocked || selectedCells.length === 0) return false;
    setPendingDelete({ kind: "cells", cells: selectedCells });
    return true;
  }

  /*
   * Delete key: whole selected rows ask to be deleted, several selected cells
   * ask to be cleared. One cell (or none) is left to the cell's own clear.
   */
  function requestBulkDelete() {
    if (isWholeRowSelection) return requestDeleteRows();
    if (selectedCells.length > 1) return requestClearCells();
    return false;
  }

  /* F5: select the last row and ask to delete it, like any selected row. */
  function requestDeleteLastRow() {
    const lastRow = rows.at(-1);
    if (!lastRow || !onRemoveRows) return;
    setSelectedCells(getRowCells(String(lastRow.id)));
    requestDeleteRows([lastRow.id]);
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
    setPendingDelete(null);
    if (!succeeded) {
      showToast(TOAST_NOTIFICATIONS.deleteFailed);
      return;
    }

    setSelectedCells([]);
    const isRows = pendingDelete.kind === "rows";
    const count = isRows ? pendingDelete.rowIds.length : pendingDelete.cells.length;
    const noun = isRows ? (count === 1 ? "row" : "rows") : (count === 1 ? "cell" : "cells");
    showToast({
      ...(isRows ? TOAST_NOTIFICATIONS.rowsRemoved : TOAST_NOTIFICATIONS.cellsCleared),
      message: `${count} ${noun} ${isRows ? "deleted" : "cleared"}`,
      ...(onUndo ? { action: { label: "Undo", onClick: () => void onUndo() } } : {}),
    });
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
  const canDeleteLastRow = isEnabled && rows.length > 0 && Boolean(onRemoveRows);

  useEffect(() => {
    if (tableWrapperRef.current) {
      tableWrapperRef.current.scrollTop = 0;
    }
  }, [currentPage]);

  // Read by the document listeners below, which are registered once.
  const latest = useRef({ rows, selectedCells, isBlocked });
  latest.current = { rows, selectedCells, isBlocked };

  /*
   * Mouse selection, Excel style. Listening on the document covers presses
   * outside the table too (a plain press there clears the selection).
   *
   *   On a cell        press and drag to another cell selects the block;
   *                    Shift extends from the anchor, Ctrl adds a block or
   *                    toggles one cell.
   *   On a row number  click selects the row, Shift + click the rows between,
   *                    Ctrl + click adds / removes a row; dragging over the
   *                    numbers selects every row passed.
   */
  useEffect(() => {
    let drag: DragState | null = null;
    let pointer = { x: 0, y: 0 };
    let scrollFrame = 0;

    const tbody = () => tableBodyRef.current;

    function elementAt(x: number, y: number) {
      const body = tbody();
      const element = document.elementFromPoint(x, y);
      return body && element && body.contains(element) ? element : null;
    }

    // Applies the drag to the pointer's current position.
    function updateDrag() {
      if (!drag) return;
      const currentRows = latest.current.rows;
      const element = elementAt(pointer.x, pointer.y);

      if (drag.mode === "rows") {
        const rowId = element?.closest<HTMLTableRowElement>("tr[data-row-id]")?.dataset.rowId;
        if (!rowId || rowId === drag.lastRowId) return;
        drag.lastRowId = rowId;
        setSelectedCells(mergeCells(drag.base, getRowRange(currentRows, drag.anchorRowId, rowId)));
        return;
      }

      const cell = getCellRef(element);
      if (!cell || isSameCell(cell, drag.last)) return;

      if (!drag.active) {
        drag.active = true;
        // From here on it is a cell selection, not text selection.
        const body = tbody();
        if (body) body.style.userSelect = "none";
        const focused = document.activeElement;
        if (focused instanceof HTMLInputElement) {
          try {
            focused.setSelectionRange(focused.value.length, focused.value.length);
          } catch {
            // Number inputs have no text selection.
          }
        }
        window.getSelection()?.removeAllRanges();
      }

      drag.last = cell;
      setSelectedCells(mergeCells(drag.base, getCellRange(currentRows, drag.anchor, cell)));
    }

    // Scrolls the table while the pointer is held near its top or bottom edge.
    function autoScroll() {
      scrollFrame = 0;
      const wrapper = tableWrapperRef.current;
      if (!drag || !wrapper) return;
      if (drag.mode === "cells" && !drag.active) return;

      const bounds = wrapper.getBoundingClientRect();
      // Too small (or not laid out) to have edges worth scrolling from.
      if (bounds.height < AUTO_SCROLL_EDGE * 3) return;
      const delta =
        pointer.y < bounds.top + AUTO_SCROLL_EDGE
          ? -AUTO_SCROLL_STEP
          : pointer.y > bounds.bottom - AUTO_SCROLL_EDGE
            ? AUTO_SCROLL_STEP
            : 0;
      if (delta === 0) return;

      wrapper.scrollTop += delta;
      // Select up to the row now under the pointer, kept inside the table.
      const held = pointer;
      pointer = {
        x: held.x,
        y: Math.min(Math.max(held.y, bounds.top + AUTO_SCROLL_EDGE), bounds.bottom - AUTO_SCROLL_EDGE),
      };
      updateDrag();
      pointer = held;
      scrollFrame = window.requestAnimationFrame(autoScroll);
    }

    function handleMouseMove(event: MouseEvent) {
      if (!drag) return;
      if ((event.buttons & 1) === 0) {
        endDrag();
        return;
      }
      pointer = { x: event.clientX, y: event.clientY };
      updateDrag();
      if (!scrollFrame) scrollFrame = window.requestAnimationFrame(autoScroll);
    }

    function endDrag() {
      if (!drag) return;
      const finished = drag;
      drag = null;
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", endDrag);
      if (scrollFrame) window.cancelAnimationFrame(scrollFrame);
      scrollFrame = 0;
      const body = tbody();
      if (body) body.style.userSelect = "";

      // Keep focus in the table so Delete / Ctrl + C reach its handlers. The
      // anchor stays where the drag started, as in Excel.
      if (finished.mode === "cells" && finished.active) {
        focusCellInRow(body, finished.anchor.rowId, finished.anchor.columnKey);
        anchorCell.current = finished.anchor;
      }
    }

    function startDrag(state: DragState, event: MouseEvent) {
      drag = state;
      pointer = { x: event.clientX, y: event.clientY };
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", endDrag);
    }

    function handleRowHeader(event: MouseEvent, rowId: string) {
      event.preventDefault();
      const { rows: currentRows, selectedCells: current } = latest.current;
      const additive = event.ctrlKey || event.metaKey;
      const rowCells = getRowCells(rowId);

      if (additive && !event.shiftKey && getFullySelectedRowIds(currentRows, current).includes(rowId)) {
        // Ctrl + click on a selected row takes it out of the selection.
        setSelectedCells(current.filter((item) => item.rowId !== rowId));
        anchorRowId.current = rowId;
        return;
      }

      const anchor =
        event.shiftKey && anchorRowId.current &&
        currentRows.some((row) => String(row.id) === anchorRowId.current)
          ? anchorRowId.current
          : rowId;
      const base = additive ? current : [];
      anchorRowId.current = anchor;
      setSelectedCells(mergeCells(base, getRowRange(currentRows, anchor, rowId)));
      // Focus a cell of the row, so Delete, Ctrl + C and Esc reach the table.
      focusCellInRow(tbody(), rowId, FIRST_COLUMN_KEY);
      anchorCell.current = rowCells[0] ?? null;
      startDrag({ mode: "rows", anchorRowId: anchor, lastRowId: rowId, base }, event);
    }

    function handleMouseDown(event: MouseEvent) {
      if (event.button !== 0 || latest.current.isBlocked) return;

      const target = event.target instanceof Element ? event.target : null;
      // The selection bar acts on the selection; pressing it must not clear
      // the selection first.
      if (target?.closest("[data-keep-selection]")) return;

      const body = tbody();
      const inBody = Boolean(body && target && body.contains(target));

      const rowHeader = inBody ? target?.closest("[data-row-number]") : null;
      const headerRowId = rowHeader?.closest<HTMLTableRowElement>("tr[data-row-id]")?.dataset.rowId;
      if (rowHeader && headerRowId) {
        if (!rowHeader.querySelector("button:disabled")) handleRowHeader(event, headerRowId);
        return;
      }

      const cell = inBody ? getCellRef(target) : null;
      const { rows: currentRows, selectedCells: current } = latest.current;
      const additive = event.ctrlKey || event.metaKey;

      if (!cell) {
        if (!additive && !event.shiftKey && current.length > 0) setSelectedCells([]);
        return;
      }

      if (event.shiftKey) {
        event.preventDefault();
        const anchor =
          anchorCell.current &&
          currentRows.some((row) => String(row.id) === anchorCell.current?.rowId)
            ? anchorCell.current
            : cell;
        const base = additive ? current : [];
        setSelectedCells(mergeCells(base, getCellRange(currentRows, anchor, cell)));
        focusCellInRow(body, cell.rowId, cell.columnKey);
        // Focusing the clicked cell must not move the range's start.
        anchorCell.current = anchor;
        startDrag({ mode: "cells", anchor, last: cell, base, active: true }, event);
        return;
      }

      if (additive) {
        event.preventDefault();
        anchorCell.current = cell;
        const isSelected = current.some((item) => isSameCell(item, cell));
        setSelectedCells(
          isSelected ? current.filter((item) => !isSameCell(item, cell)) : [...current, cell],
        );
        focusCellInRow(body, cell.rowId, cell.columnKey);
        startDrag({ mode: "cells", anchor: cell, last: cell, base: current, active: false }, event);
        return;
      }

      // Plain press: the cell becomes the anchor. A click inside the current
      // selection keeps it (to paste into it); anywhere else clears it.
      anchorCell.current = cell;
      if (current.length > 0 && !current.some((item) => isSameCell(item, cell))) {
        setSelectedCells([]);
      }
      startDrag({ mode: "cells", anchor: cell, last: cell, base: [], active: false }, event);
    }

    document.addEventListener("mousedown", handleMouseDown);
    return () => {
      document.removeEventListener("mousedown", handleMouseDown);
      endDrag();
    };
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
    canRemoveLastRow: canDeleteLastRow,
    onAddRow: requestAddRow,
    onRemoveLastRow: requestDeleteLastRow,
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
      const depthSpan = describeDepthSpan(rows.filter((row) => ids.has(String(row.id))));
      const rowsLabel = count === 1 ? "1 row" : `${count} rows`;
      return (
        <ConfirmDialog
          title={`Delete ${rowsLabel}?`}
          message={
            count === rows.length
              ? "Every row and all its values will be deleted. One empty row is left to start again. You can undo this right after."
              : count === 1
                ? "This row and all its values will be deleted. You can undo this right after."
                : "These rows and all their values will be deleted. You can undo this right after."
          }
          facts={[
            ["Rows", formatRowNumbers(rowNumbersOf(pendingDelete.rowIds))],
            ...(depthSpan ? [["Depth", depthSpan] as [string, string]] : []),
          ]}
          confirmLabel={`Delete ${rowsLabel}`}
          busyLabel="Deleting…"
          isBusy={isDeleting}
          onConfirm={confirmDelete}
          onCancel={cancelDelete}
        />
      );
    }
    const count = pendingDelete.cells.length;
    const rowIds = [...new Set(pendingDelete.cells.map((cell) => cell.rowId))];
    return (
      <ConfirmDialog
        title={`Clear ${count === 1 ? "1 cell" : `${count} cells`}?`}
        message="The values in the selected cells will be emptied. The rows stay. You can undo this right after."
        facts={[
          ["Cells", String(count)],
          ["Rows", formatRowNumbers(rowNumbersOf(rowIds))],
        ]}
        confirmLabel="Clear values"
        busyLabel="Clearing…"
        isBusy={isDeleting}
        onConfirm={confirmDelete}
        onCancel={cancelDelete}
      />
    );
  })();

  const canSelectAll = isEnabled && rows.length > 0;

  return (
    <div className="flex min-h-0 w-full min-w-0 flex-1 flex-col">
      {deleteDialog}
      <RawLithoSelectionBar
        cellCount={selectedCells.length}
        rowCount={selectedRowCount}
        wholeRowCount={isWholeRowSelection ? fullRowIds.length : 0}
        wholeRowNumbers={isWholeRowSelection ? formatRowNumbers(rowNumbersOf(fullRowIds)) : ""}
        isEnabled={isEnabled && !isBlocked}
        onClearValues={onClearCells ? requestClearCells : undefined}
        onDeleteRows={onRemoveRows ? () => requestDeleteRows() : undefined}
        onDismiss={() => setSelectedCells([])}
      />
      <div ref={tableWrapperRef} className={`${TABLE_FRAME} scroll-smooth`}>
        <table className={TABLE} style={{ minWidth: rawLithoConfig.minWidth }}>
          <thead>
            <tr>
              <th
                className={`${HEADER_CELL} p-0`}
                style={{ width: INDEX_COLUMN_WIDTH }}
              >
                {/* Like Excel's corner cell: selects every row. */}
                <button
                  type="button"
                  tabIndex={-1}
                  className="block size-full cursor-pointer border-0 bg-transparent px-1 font-[inherit] text-inherit hover:bg-rl-navy-soft disabled:cursor-default disabled:hover:bg-transparent"
                  disabled={!canSelectAll}
                  onClick={() => {
                    setSelectedCells(rows.flatMap((row) => getRowCells(String(row.id))));
                    anchorRowId.current = rows[0] ? String(rows[0].id) : null;
                    const firstVisible = visibleRows[0];
                    if (firstVisible) {
                      focusCellInRow(tableBodyRef.current, firstVisible.id, FIRST_COLUMN_KEY);
                    }
                  }}
                  title="Row number. Click to select all rows; click a number to select that row."
                  aria-label="Select all rows"
                >
                  No.
                </button>
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
                if (requestBulkDelete()) {
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
                isRowSelected={fullRowIdSet.has(String(row.id))}
              />
            ))}
          </tbody>
        </table>
      </div>

      {/*
        One bar under the table: Add row on the left, pagination centred,
        and the page's own controls (Save JSON) on the right. Deleting lives
        in the selection bar above the table. Three columns keep the
        pagination centred; on narrow screens it takes its own centred line
        below the buttons instead of overflowing.
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
