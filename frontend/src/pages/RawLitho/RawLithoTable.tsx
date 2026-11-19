import type {
  RawLithoRow as RawLithoRowRecord,
  RowField,
  LookupData,
  LookupStatuses,
  RowChange,
  AddRowResult,
  Notify,
} from "../../types/domain";
import { useCallback, useDeferredValue, useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import RawLithoRow from "./RawLithoRow";
import RawLithoDraftStatusBanner from "./RawLithoDraftStatusBanner";
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
  getCellRef,
  getRowCells,
  isTabularClipboard,
  parseClipboardText,
  planPaste,
  type CellEdit,
  type CellRef,
} from "./rawLithoClipboard";
import { findOverlappingIntervalRowIds } from "./rawLithoValidation";
import ConfirmDialog from "../../components/ConfirmDialog";
import SelectionBar from "../../components/dataTable/SelectionBar";
import { countLabel } from "../../components/dataTable/tableSelection";
import { SelectAllHeaderCell } from "../../components/dataTable/RowHeaderCell";
import { useTableSelection } from "../../components/dataTable/useTableSelection";
import type { RowId } from "../../types/domain";
import {
  INDEX_COLUMN_WIDTH,
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

const COLUMN_KEYS: readonly RowField[] = tableColumns.map((column) => column.key);
const { rowHeight, minWidth, overscan } = rawLithoConfig;

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
  const [pendingDelete, setPendingDelete] = useState<
    | { kind: "rows"; rowIds: RowId[] }
    | { kind: "cells"; cells: CellRef[] }
    | null
  >(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const isBlocked = isBlockedOutside || pendingDelete !== null;

  const rowIds = useMemo(() => rows.map((row) => String(row.id)), [rows]);
  const rowIndexById = useMemo(
    () => new Map(rowIds.map((rowId, index) => [rowId, index])),
    [rowIds],
  );

  /*
   * Every row lives in one scrolling table, but only the rows in view (plus
   * `overscan`) are in the DOM: two spacer rows stand in for the rest, which
   * keeps real <table> layout and the sticky header. Rows have a fixed height.
   */
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => tableWrapperRef.current,
    estimateSize: () => rowHeight,
    overscan,
    getItemKey: (index) => rowIds[index] ?? index,
    initialRect: { width: minWidth, height: rowHeight * 20 },
  });
  const scrollToRowIndex = useCallback(
    (index: number) => virtualizer.scrollToIndex(index, { align: "auto" }),
    [virtualizer],
  );

  const focusRenderedCell = useCallback(
    (rowId: string, columnKey: RowField) =>
      focusCellInRow(tableBodyRef.current, rowId, columnKey),
    [],
  );

  // The one selection: cells by row id and column key, so it survives
  // sorting and scrolling. A row counts as selected when every one of its
  // cells is (useTableSelection: drag, Shift, Ctrl, row numbers).
  const {
    selectedCells,
    setSelectedCells,
    selectedColumnsByRow,
    fullRowIds,
    fullRowIdSet,
    selectedRowCount,
    isWholeRowSelection,
    selectAll,
    clearSelection,
    noteFocus,
  } = useTableSelection({
    rowIds,
    columnKeys: COLUMN_KEYS,
    frameRef: tableWrapperRef,
    bodyRef: tableBodyRef,
    isBlocked,
    focusRenderedCell,
  });

  function rowNumbersOf(ids: readonly (string | RowId)[]) {
    return ids.flatMap((rowId) => {
      const index = rowIndexById.get(String(rowId));
      return index === undefined ? [] : [index + 1];
    });
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
    showToast({
      ...(isRows ? TOAST_NOTIFICATIONS.rowsRemoved : TOAST_NOTIFICATIONS.cellsCleared),
      message: `${countLabel(count, isRows ? "row" : "cell")} ${isRows ? "deleted" : "cleared"}`,
      ...(onUndo ? { action: { label: "Undo", onClick: () => void onUndo() } } : {}),
    });
  }

  function cancelDelete() {
    if (!isDeleting) setPendingDelete(null);
  }

  // Deferred: typing never waits on the overlap check of a long drillhole.
  const deferredRows = useDeferredValue(rows);
  const overlappingRowIds = useMemo(
    () => findOverlappingIntervalRowIds(deferredRows),
    [deferredRows],
  );
  const canDeleteLastRow = isEnabled && rows.length > 0 && Boolean(onRemoveRows);

  const { focusRowCell, requestFocus, handleTableFocus, getPendingRowId } = useRawLithoRowFocus({
    tableBodyRef,
    rows,
    scrollToRowIndex,
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

    // Focus locks onto the invalid cell, scrolling to it if it is out of view.
    if (result?.rowId === undefined) return result;

    focusRowCell(result.rowId, result.focusField ?? FALLBACK_FOCUS_FIELD);
    return result;
  }, [focusRowCell, onAddRow, requestFocus]);

  /*
   * PageUp / PageDown: the caret moves one screen of rows in the same column,
   * scrolling with it. Without a focused cell the table just scrolls.
   */
  function moveOneScreen(direction: -1 | 1) {
    const frame = tableWrapperRef.current;
    const screenRows = Math.max(1, Math.floor((frame?.clientHeight ?? 0) / rowHeight) - 1);
    const focused = document.activeElement;
    const rowId = tableBodyRef.current?.contains(focused)
      ? (getPendingRowId() ?? getRowIdFromElement(focused))
      : null;
    const index = rowId === null ? undefined : rowIndexById.get(rowId);

    if (index === undefined) {
      if (frame) frame.scrollTop += direction * screenRows * rowHeight;
      return;
    }

    const target = rows[Math.min(Math.max(index + direction * screenRows, 0), rows.length - 1)];
    if (target && String(target.id) !== rowId) {
      focusRowCell(target.id, getColumnKeyFromElement(focused) ?? FIRST_COLUMN_KEY);
    }
  }

  useRawLithoShortcuts({
    isEnabled,
    isBlocked,
    canRemoveLastRow: canDeleteLastRow,
    onAddRow: requestAddRow,
    onRemoveLastRow: requestDeleteLastRow,
    onScreenMove: moveOneScreen,
  });

  /*
   * Tab / Shift + Tab / ArrowRight / ArrowLeft at the edge of the rendered
   * rows: the cell handler found no neighbour, so continue in the adjacent
   * row, scrolling it into the rendered window. Shift + Tab stops at the first
   * editable cell; forward Tab at the final cell reaches the shared
   * row-creation path.
   */
  function focusAdjacentRow(element: EventTarget, step: number) {
    const rowId = getRowIdFromElement(element);
    const sourceCell = element instanceof Element ? element.closest("td") : null;
    const index = rowId === null ? -1 : (rowIndexById.get(rowId) ?? -1);
    if (index === -1) return false;

    for (let distance = 1; distance <= rows.length; distance += 1) {
      const position = index + step * distance;
      if (position < 0 || position >= rows.length) return false;
      const target = rows[position];
      if (!target) return false;
      const rendered = Array.from(
        tableBodyRef.current?.querySelectorAll<HTMLTableRowElement>("tr[data-row-id]") ?? [],
      ).find((row) => row.dataset.rowId === String(target.id));
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
    if (event.key === "Escape") clearSelection();

    if (!isEnabled || isBlocked) return;

    // A cell handler (arrow navigation, lookup dropdown) already used this key.
    if (isKeyAlreadyHandled(event)) return;
    // Secondary controls and wrappers may not have their own cell handler.
    // Resolve them from the same logical cell before considering the edges.
    if (handleCellNavigation(event)) return;

    const step = getHorizontalStep(event);

    const tbody = tableBodyRef.current;
    const sourceCell = event.target instanceof Element ? event.target.closest("td") : null;
    const editors = step !== 0 && tbody ? getEditableElements(tbody) : [];
    const isEditableCell = Boolean(sourceCell && editors.some(editor => editor.closest("td") === sourceCell));
    if (step !== 0 && isEditableCell &&
        focusAdjacentRow(event.target, step)) {
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

    const focusedRowId = getRowIdFromElement(event.target);
    const focusedIndex = focusedRowId === null ? -1 : (rowIndexById.get(focusedRowId) ?? -1);

    // ArrowUp / ArrowDown past the rendered rows: the neighbour is scrolled
    // into view and focused in the same column. A row still being scrolled
    // to counts as the current one, so a held arrow key loses no presses.
    const pendingRowId = getPendingRowId();
    const rowIndex = pendingRowId === null ? focusedIndex : (rowIndexById.get(pendingRowId) ?? focusedIndex);
    const isVertical = (event.key === "ArrowDown" || event.key === "ArrowUp") &&
      !event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey;
    const neighbour = isVertical && sourceCell && rowIndex !== -1
      ? rows[rowIndex + (event.key === "ArrowDown" ? 1 : -1)]
      : undefined;
    if (neighbour) {
      event.preventDefault();
      markKeyAsHandled(event);
      focusRowCell(neighbour.id, getColumnKeyFromElement(event.target));
      return;
    }

    // Only the document's final row creates a new row.
    if (focusedIndex === -1 || focusedIndex !== rows.length - 1) return;
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
      const rowsLabel = countLabel(count, "row");
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
        title={`Clear ${countLabel(count, "cell")}?`}
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
  const items = virtualizer.getVirtualItems();
  const paddingTop = items[0]?.start ?? 0;
  const paddingBottom = virtualizer.getTotalSize() - (items.at(-1)?.end ?? 0);
  const columnCount = tableColumns.length + 1;

  return (
    <div className="flex min-h-0 w-full min-w-0 flex-1 flex-col">
      {deleteDialog}
      <RawLithoDraftStatusBanner />
      <SelectionBar
        cellCount={selectedCells.length}
        rowCount={selectedRowCount}
        wholeRowCount={isWholeRowSelection ? fullRowIds.length : 0}
        wholeRowNumbers={isWholeRowSelection ? formatRowNumbers(rowNumbersOf(fullRowIds)) : ""}
        isEnabled={isEnabled && !isBlocked}
        onClearValues={onClearCells ? requestClearCells : undefined}
        onDeleteRows={onRemoveRows ? () => requestDeleteRows() : undefined}
        onDismiss={clearSelection}
      />
      <div ref={tableWrapperRef} className={TABLE_FRAME}>
        <table
          className={TABLE}
          style={{ minWidth }}
          aria-rowcount={rows.length + 1}
        >
          <thead>
            <tr>
              <SelectAllHeaderCell
                className={HEADER_CELL}
                width={INDEX_COLUMN_WIDTH}
                isEnabled={canSelectAll}
                onSelectAll={selectAll}
              />

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
              noteFocus(event.target);
              handleTableFocus(event);
            }}
            onCopy={handleCopy}
            onPaste={handlePaste}
          >
            {paddingTop > 0 && (
              <tr aria-hidden="true" data-spacer style={{ height: paddingTop }}>
                <td colSpan={columnCount} />
              </tr>
            )}

            {items.map((item) => {
              const row = rows[item.index];
              if (!row) return null;
              const rowId = String(row.id);
              return (
                <RawLithoRow
                  key={row.id}
                  row={row}
                  rowIndex={item.index}
                  lookupData={lookupData}
                  lookupStatus={lookupStatus}
                  onRowChange={onRowChange}
                  onDepthCommit={onDepthCommit}
                  isEnabled={isEnabled}
                  hasOverlappingInterval={overlappingRowIds.has(row.id)}
                  selectedColumns={selectedColumnsByRow.get(rowId)}
                  isRowSelected={fullRowIdSet.has(rowId)}
                />
              );
            })}

            {paddingBottom > 0 && (
              <tr aria-hidden="true" data-spacer style={{ height: paddingBottom }}>
                <td colSpan={columnCount} />
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/*
        One bar under the table: Add row on the left, the row count centred,
        and the page's own controls (Save JSON) on the right. Deleting lives
        in the selection bar above the table. On narrow screens the count
        takes its own centred line below the buttons.
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

        <p
          className="m-0 text-center text-[0.8125rem] font-semibold text-rl-text tabular-nums max-lg:order-last max-lg:w-full lg:justify-self-center"
          aria-live="polite"
        >
          {countLabel(rows.length, "row")}
        </p>

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
