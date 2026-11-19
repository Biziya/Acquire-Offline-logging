import type { Notify, RowField } from "../../types/domain";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { isRecord } from "../../types/validation";
import { DEPTH_FIELDS } from "../../types/rawLithoSchema";
import { canLeaveCell, isKeyAlreadyHandled, markKeyAsHandled } from "../RawLitho/tableNavigation";
import { parseClipboardText } from "../RawLitho/rawLithoClipboard";
import LookupAutocomplete from "../RawLitho/LookupAutocomplete";
import { rawLithoConfig } from "../RawLitho/config";
import {
  COMPACT_COLUMN_KEYS,
  REQUIRED_COLUMN_KEYS,
  tableColumns as columns,
} from "../RawLitho/constants";
import { RAW_LITHO_LOOKUP_BY_FIELD } from "../../services/rawLithoLookupConfig";
import { cellText, isEditableValue, type CellEdit } from "./uploadDataDocument";
import type { RowStatus, UploadLookups, UploadValidation } from "./uploadDataValidation";
import { uploadDataConfig } from "./config";
import ConfirmDialog from "../../components/ConfirmDialog";
import SelectionBar from "../../components/dataTable/SelectionBar";
import RowHeaderCell, { SelectAllHeaderCell } from "../../components/dataTable/RowHeaderCell";
import { useTableSelection } from "../../components/dataTable/useTableSelection";
import {
  countLabel,
  formatRowNumbers,
  type CellRef,
} from "../../components/dataTable/tableSelection";
import {
  BODY_CELL,
  CELL_INPUT,
  HEADER_CELL,
  REQUIRED_MARK,
  TABLE,
  TABLE_FRAME,
  bodyRowClass,
  toPercentWidths,
} from "../../components/dataTableStyles";

interface UploadDataTableProps {
  rows: readonly unknown[];
  /* Indices into `rows`, in display order, after search and filter. */
  visibleRows: readonly number[];
  validation: UploadValidation | null;
  lookups: UploadLookups;
  isReadOnly: boolean;
  onEdit: (edits: CellEdit[]) => void;
  /*
   * Deleting selected records / emptying selected cells, after the table has
   * asked for confirmation. Both return false when nothing could change.
   */
  onRemoveRows?: (rowIndexes: number[]) => boolean;
  onClearCells?: (edits: CellEdit[]) => boolean;
  /* Offered as Undo in the toast after a delete or clear. */
  onUndo?: () => unknown;
  showToast?: Notify;
}

interface CellPosition {
  /* Position in `visibleRows`, not the record index. */
  position: number;
  column: number;
}

// Same columns, widths and row height as Raw Litho, plus the Status column.
const { rowHeight, minWidth, indexColumnWidth } = rawLithoConfig;
const { overscan, maxHeightVh, statusColumnWidth } = uploadDataConfig;
const [indexWidth = "auto", statusWidth, ...columnWidths] = toPercentWidths([
  indexColumnWidth,
  statusColumnWidth,
  ...rawLithoConfig.columns
    .filter((column) => column.visible)
    .map((column) => column.width),
]);
const COLUMN_KEYS: readonly RowField[] = columns.map((column) => column.key);
const RECORD = "record";

// Strongest first: the selection shows over error / warning.
const CELL_STATES = {
  selected:
    "upload-cell--selected bg-rl-select shadow-[inset_0_0_0_2px_var(--color-rl-select-ring)]",
  error:
    "upload-cell--error bg-rl-danger-soft shadow-[inset_0_0_0_2px_var(--color-rl-required-soft)] focus-within:shadow-[inset_0_0_0_2px_var(--color-rl-cell-ring)]",
  warning:
    "upload-cell--warning bg-rl-warning-soft shadow-[inset_0_0_0_2px_var(--color-rl-warning-border)] focus-within:shadow-[inset_0_0_0_2px_var(--color-rl-cell-ring)]",
  normal:
    "focus-within:bg-white focus-within:shadow-[inset_0_0_0_2px_var(--color-rl-cell-ring)]",
};

const STATUS_MARKS: Record<RowStatus, { icon: string; className: string; text: string }> = {
  valid: { icon: "M5 12.5l4.5 4.5L19 7.5", className: "text-rl-success", text: "Valid" },
  warning: { icon: "M12 7v6M12 17h.01", className: "text-rl-warning", text: "Warning" },
  error: { icon: "m7 7 10 10M17 7 7 17", className: "text-rl-danger", text: "Invalid" },
};

function getCellPosition(target: EventTarget | null): CellPosition | null {
  const input =
    target instanceof Element ? target.closest<HTMLElement>("[data-cell]") : null;
  const [position, column] = (input?.dataset.cell ?? "").split(":").map(Number);

  return position === undefined || column === undefined || Number.isNaN(position + column)
    ? null
    : { position, column };
}

interface DepthDraft {
  rowIndex: number;
  field: RowField;
  text: string;
}

/*
 * A depth that is a JSON number is stored as a number on every keystroke, so
 * "5." would show as "5" and lose its dot. While the cell has focus it shows
 * the typed text instead, as long as that text still means the stored value
 * (an undo or paste meanwhile shows the new value). Leaving the cell drops
 * the typed text and shows the stored value.
 */
function shownDepthText(draft: DepthDraft | null, rowIndex: number, field: RowField, value: string) {
  if (!draft || draft.rowIndex !== rowIndex || draft.field !== field) return value;
  if (draft.text === value) return value;
  const typed = draft.text.trim();
  return typed !== "" && value.trim() !== "" && Number(typed) === Number(value)
    ? draft.text
    : value;
}

/*
 * The editable preview. Only the rows in view (plus `overscan`) are in the
 * DOM; every value is read from the working document on render, so an edit
 * survives its row scrolling out of view and back. Rows are keyed by their
 * record index.
 *
 * Selection works as in Raw Litho (useTableSelection): drag across cells,
 * Shift / Ctrl + click, the record number for whole records, and the No.
 * header for every listed record. The bar above the table clears values or
 * deletes records, after a confirmation, with Undo in the toast.
 */
function UploadDataTable({
  rows,
  visibleRows,
  validation,
  lookups,
  isReadOnly,
  onEdit,
  onRemoveRows,
  onClearCells,
  onUndo,
  showToast,
}: UploadDataTableProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLTableSectionElement>(null);
  const pendingFocus = useRef<CellPosition | null>(null);
  const [notice, setNotice] = useState("");
  const [depthDraft, setDepthDraft] = useState<DepthDraft | null>(null);
  const [pendingDelete, setPendingDelete] = useState<
    | { kind: "rows"; rowIndexes: number[] }
    | { kind: "cells"; cells: CellRef<RowField>[] }
    | null
  >(null);
  const isBlocked = isReadOnly || pendingDelete !== null;

  // Selection row ids are record indices as text, in display order.
  const rowIds = useMemo(() => visibleRows.map(String), [visibleRows]);
  const positionByRow = useMemo(
    () => new Map(visibleRows.map((rowIndex, position) => [rowIndex, position])),
    [visibleRows],
  );

  const virtualizer = useVirtualizer({
    count: visibleRows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => rowHeight,
    overscan,
    getItemKey: (position) => visibleRows[position] ?? position,
    initialRect: { width: minWidth, height: rowHeight * 20 },
  });

  const focusRenderedCell = useCallback((rowId: string, columnKey: RowField) => {
    const input = scrollRef.current?.querySelector<HTMLInputElement>(
      `input[data-row-index="${rowId}"][data-field="${columnKey}"]`,
    );
    if (!input) return false;
    if (input !== document.activeElement) {
      input.focus();
      input.select();
    }
    return true;
  }, []);

  const {
    selectedCells,
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
    frameRef: scrollRef,
    bodyRef,
    isBlocked,
    focusRenderedCell,
  });

  function focusRendered({ position, column }: CellPosition) {
    const input = scrollRef.current?.querySelector<HTMLInputElement>(
      `[data-cell="${position}:${column}"]`,
    );
    if (!input) return false;

    input.focus();
    input.select();
    return true;
  }

  // A target row outside the rendered window is scrolled into view first and
  // focused once it has rendered.
  function focusCell(target: CellPosition) {
    if (focusRendered(target)) return;

    pendingFocus.current = target;
    virtualizer.scrollToIndex(target.position, { align: "auto" });
  }

  useEffect(() => {
    if (pendingFocus.current && focusRendered(pendingFocus.current)) {
      pendingFocus.current = null;
    }
  });

  function step({ position, column }: CellPosition, delta: number): CellPosition {
    const linear = position * columns.length + column + delta;
    return {
      position: Math.floor(linear / columns.length),
      column: ((linear % columns.length) + columns.length) % columns.length,
    };
  }

  const recordNumbers = (indexes: readonly (number | string)[]) =>
    formatRowNumbers(indexes.map((index) => Number(index) + 1));

  /*
   * Delete key: whole selected records ask to be deleted, several selected
   * cells ask to be emptied. One cell (or none) is left to the input.
   */
  function requestBulkDelete() {
    if (isBlocked) return false;
    if (isWholeRowSelection && onRemoveRows) return requestDeleteRows();
    if (selectedCells.length > 1 && onClearCells) return requestClearCells();
    return false;
  }

  function requestDeleteRows() {
    if (isBlocked || !onRemoveRows || fullRowIds.length === 0) return false;
    setPendingDelete({ kind: "rows", rowIndexes: fullRowIds.map(Number) });
    return true;
  }

  function requestClearCells() {
    if (isBlocked || !onClearCells || selectedCells.length === 0) return false;
    setPendingDelete({ kind: "cells", cells: selectedCells });
    return true;
  }

  // Cells holding a JSON object or list are shown read-only and never changed.
  function isWritable(rowIndex: number, field: RowField) {
    const row = rows[rowIndex];
    return isRecord(row) && isEditableValue(row[field]);
  }

  function confirmDelete() {
    if (!pendingDelete) return;
    const isRows = pendingDelete.kind === "rows";
    const edits = isRows
      ? []
      : pendingDelete.cells
          .map((cell) => ({ rowIndex: Number(cell.rowId), field: cell.columnKey, text: "" }))
          .filter((edit) => isWritable(edit.rowIndex, edit.field));
    const count = isRows ? pendingDelete.rowIndexes.length : edits.length;
    const changed = isRows
      ? (onRemoveRows?.(pendingDelete.rowIndexes) ?? false)
      : edits.length > 0 && (onClearCells?.(edits) ?? false);

    setPendingDelete(null);
    clearSelection();
    if (!changed) {
      setNotice(isRows ? "Nothing was deleted." : "The selected cells were already empty or read-only.");
      return;
    }

    showToast?.({
      type: "success",
      message: `${countLabel(count, isRows ? RECORD : "cell")} ${isRows ? "deleted" : "cleared"}`,
      ...(onUndo ? { action: { label: "Undo", onClick: () => void onUndo() } } : {}),
    });
  }

  /*
   * Tab / Shift + Tab: next / previous cell, wrapping across records.
   * ArrowLeft / ArrowRight: the same, once the caret is at the edge of the text.
   * ArrowUp / ArrowDown and Enter: the same column in the previous / next record.
   * At either end of the table Tab leaves it as usual. Keys a lookup cell
   * already used (its list, or a move between rendered cells) are skipped.
   */
  function handleKeyDown(event: React.KeyboardEvent<HTMLTableSectionElement>) {
    if (event.key === "Escape") {
      clearSelection();
      return;
    }
    if (isKeyAlreadyHandled(event)) return;
    if (event.altKey || event.ctrlKey || event.metaKey) return;

    const current = getCellPosition(event.target);
    if (!current) return;

    let target: CellPosition | null = null;
    if (event.key === "Tab") {
      target = step(current, event.shiftKey ? -1 : 1);
    } else if (event.shiftKey) {
      return;
    } else if (event.key === "ArrowDown" || event.key === "Enter") {
      target = { ...current, position: current.position + 1 };
    } else if (event.key === "ArrowUp") {
      target = { ...current, position: current.position - 1 };
    } else if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
      const delta = event.key === "ArrowRight" ? 1 : -1;
      if (canLeaveCell(event.target, delta)) target = step(current, delta);
    }

    if (
      !target ||
      target.position < 0 ||
      target.position >= visibleRows.length
    ) {
      return;
    }

    event.preventDefault();
    focusCell(target);
  }

  /*
   * Ctrl + C with a selection copies its bounding rectangle (display order) as
   * tab-separated text; unselected cells inside it are written empty.
   */
  function handleCopy(event: React.ClipboardEvent<HTMLTableSectionElement>) {
    if (selectedCells.length === 0) return;

    let [top, bottom, left, right] = [Infinity, -Infinity, Infinity, -Infinity];
    selectedCells.forEach(({ rowId, columnKey }) => {
      const position = positionByRow.get(Number(rowId));
      const column = COLUMN_KEYS.indexOf(columnKey);
      if (position === undefined || column === -1) return;
      top = Math.min(top, position);
      bottom = Math.max(bottom, position);
      left = Math.min(left, column);
      right = Math.max(right, column);
    });
    if (top === Infinity) return;

    const lines: string[] = [];
    for (let position = top; position <= bottom; position += 1) {
      const rowIndex = visibleRows[position] ?? -1;
      const selectedColumns = selectedColumnsByRow.get(String(rowIndex));
      const values: string[] = [];
      for (let column = left; column <= right; column += 1) {
        const field = COLUMN_KEYS[column];
        values.push(
          field && selectedColumns?.has(field)
            ? cellText(rows[rowIndex], field).replace(/[\t\r\n]+/g, " ")
            : "",
        );
      }
      lines.push(values.join("\t"));
    }

    event.preventDefault();
    event.clipboardData.setData("text/plain", lines.join("\n"));
    setNotice(`Copied ${countLabel(selectedCells.length, "cell")}.`);
  }

  /*
   * One value with a selection fills every selected cell. A block (from Excel
   * or a copy above) is pasted with its top-left corner on the focused cell.
   * A single value without a selection is left to the input.
   */
  function handlePaste(event: React.ClipboardEvent<HTMLTableSectionElement>) {
    if (isReadOnly) return;

    let text: string;
    try {
      text = event.clipboardData.getData("text/plain");
    } catch {
      if (selectedCells.length === 0) return;
      event.preventDefault();
      setNotice("The clipboard could not be read; nothing was changed.");
      return;
    }

    const grid = parseClipboardText(text);
    const isBlock = grid.length > 1 || (grid[0]?.length ?? 0) > 1;
    const edits: CellEdit[] = [];

    if (!isBlock && selectedCells.length > 0) {
      const text = grid[0]?.[0] ?? "";
      selectedCells.forEach(({ rowId, columnKey }) => {
        edits.push({ rowIndex: Number(rowId), field: columnKey, text });
      });
    } else if (isBlock) {
      const anchor = getCellPosition(event.target);
      if (!anchor) return;

      const fits =
        anchor.position + grid.length <= visibleRows.length &&
        grid.every((line) => anchor.column + line.length <= columns.length);
      if (!fits) {
        event.preventDefault();
        setNotice("Paste exceeds the table; nothing was changed.");
        return;
      }

      grid.forEach((line, rowOffset) => {
        const rowIndex = visibleRows[anchor.position + rowOffset];
        line.forEach((text, columnOffset) => {
          const field = columns[anchor.column + columnOffset]?.key;
          if (rowIndex !== undefined && field) edits.push({ rowIndex, field, text });
        });
      });
    } else {
      return;
    }

    event.preventDefault();

    const writable = edits.filter((edit) => isWritable(edit.rowIndex, edit.field));
    const skipped = edits.length - writable.length;

    onEdit(writable);
    setNotice(
      `Pasted into ${countLabel(writable.length, "cell")}.` +
        (skipped > 0 ? ` ${skipped} read-only cell${skipped === 1 ? " was" : "s were"} left unchanged.` : ""),
    );
  }

  const deleteDialog = pendingDelete && (() => {
    if (pendingDelete.kind === "rows") {
      const label = countLabel(pendingDelete.rowIndexes.length, RECORD);
      return (
        <ConfirmDialog
          title={`Delete ${label}?`}
          message={`${pendingDelete.rowIndexes.length === 1 ? "This record is" : "These records are"} removed from the file before upload. Nothing is sent to the database. You can undo this right after.`}
          facts={[["Records", recordNumbers(pendingDelete.rowIndexes)]]}
          confirmLabel={`Delete ${label}`}
          onConfirm={confirmDelete}
          onCancel={() => setPendingDelete(null)}
        />
      );
    }
    const label = countLabel(pendingDelete.cells.length, "cell");
    return (
      <ConfirmDialog
        title={`Clear ${label}?`}
        message="The values in the selected cells will be emptied. The records stay, and cells holding JSON objects or lists are left unchanged. You can undo this right after."
        facts={[
          ["Cells", String(pendingDelete.cells.length)],
          ["Records", recordNumbers([...new Set(pendingDelete.cells.map((cell) => cell.rowId))])],
        ]}
        confirmLabel="Clear values"
        onConfirm={confirmDelete}
        onCancel={() => setPendingDelete(null)}
      />
    );
  })();

  const items = virtualizer.getVirtualItems();
  const paddingTop = items[0]?.start ?? 0;
  const paddingBottom =
    virtualizer.getTotalSize() - (items[items.length - 1]?.end ?? 0);
  const columnCount = columns.length + 2;

  return (
    <>
      {deleteDialog}
      <SelectionBar
        cellCount={selectedCells.length}
        rowCount={selectedRowCount}
        wholeRowCount={isWholeRowSelection ? fullRowIds.length : 0}
        wholeRowNumbers={isWholeRowSelection ? recordNumbers(fullRowIds) : ""}
        isEnabled={!isBlocked}
        onClearValues={onClearCells ? requestClearCells : undefined}
        onDeleteRows={onRemoveRows ? requestDeleteRows : undefined}
        onDismiss={clearSelection}
        rowNoun={RECORD}
      />
      <div
        ref={scrollRef}
        className={TABLE_FRAME}
        // Grows with the records, up to the configured share of the window.
        style={{ maxHeight: `${maxHeightVh}vh` }}
      >
        <table
          className={TABLE}
          style={{ minWidth }}
          aria-rowcount={visibleRows.length + 1}
        >
          <thead>
            <tr>
              <SelectAllHeaderCell
                className={HEADER_CELL}
                width={indexWidth}
                isEnabled={!isBlocked && visibleRows.length > 0}
                onSelectAll={selectAll}
                rowNoun={RECORD}
              />
              <th className={HEADER_CELL} style={{ width: statusWidth }}>
                Status
              </th>
              {columns.map((column, columnIndex) => (
                <th
                  key={column.key}
                  className={HEADER_CELL}
                  style={{ width: columnWidths[columnIndex] }}
                >
                  {column.label}
                  {REQUIRED_COLUMN_KEYS.has(column.key) && (
                    <abbr className={REQUIRED_MARK} title="Required field">
                      *
                    </abbr>
                  )}
                </th>
              ))}
            </tr>
          </thead>

          <tbody
            ref={bodyRef}
            onKeyDownCapture={(event) => {
              // Bulk Delete runs before the input's own text delete.
              if (event.key === "Delete" && !event.altKey && !event.ctrlKey &&
                  !event.metaKey && !event.shiftKey && requestBulkDelete()) {
                event.preventDefault();
                event.stopPropagation();
                markKeyAsHandled(event);
              }
            }}
            onKeyDown={handleKeyDown}
            onFocus={(event) => noteFocus(event.target)}
            onCopy={handleCopy}
            onPaste={handlePaste}
          >
            {paddingTop > 0 && (
              <tr aria-hidden="true" data-spacer style={{ height: paddingTop }}>
                <td colSpan={columnCount} />
              </tr>
            )}

            {items.map((item) => {
              const rowIndex = visibleRows[item.index];
              if (rowIndex === undefined) return null;

              const row = rows[rowIndex];
              const rowId = String(rowIndex);
              const selectedColumns = selectedColumnsByRow.get(rowId);
              const issues = validation?.rowIssues[rowIndex];
              const status = validation?.rowStatus[rowIndex];
              const mark = status ? STATUS_MARKS[status] : null;
              const messages = Array.from(
                new Set(issues?.map((issue) => issue.message)),
              );

              return (
                <tr
                  key={rowIndex}
                  className={bodyRowClass(item.index)}
                  style={{ height: rowHeight }}
                  aria-rowindex={item.index + 2}
                  data-row-id={rowId}
                >
                  <RowHeaderCell
                    number={rowIndex + 1}
                    isSelected={fullRowIdSet.has(rowId)}
                    isEnabled={!isReadOnly}
                    rowNoun={RECORD}
                  />
                  <td
                    className={`${BODY_CELL} font-bold ${mark?.className ?? ""}`}
                    title={messages.join("\n") || mark?.text}
                  >
                    {mark && (
                      <>
                        <svg className="inline size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={mark.icon} /></svg>
                        <span className="sr-only">
                          {mark.text}
                          {messages.length > 0 ? `: ${messages.join(" ")}` : ""}
                        </span>
                      </>
                    )}
                  </td>

                  {columns.map((column, columnIndex) => {
                    const cellIssues = issues?.filter(
                      (issue) => issue.field === column.key,
                    );
                    const severity = cellIssues?.some(
                      (issue) => issue.severity === "error",
                    )
                      ? "error"
                      : cellIssues?.length
                        ? "warning"
                        : null;
                    const isSelected = selectedColumns?.has(column.key) ?? false;
                    const state = isSelected
                      ? CELL_STATES.selected
                      : (severity && CELL_STATES[severity]) || CELL_STATES.normal;
                    const isEditable =
                      isRecord(row) && isEditableValue(row[column.key]);
                    const lookup = RAW_LITHO_LOOKUP_BY_FIELD[column.key];
                    const isCompact = COMPACT_COLUMN_KEYS.has(column.key);
                    const value = cellText(row, column.key);
                    const isDepth = DEPTH_FIELDS.has(column.key);
                    const dataAttributes = {
                      "data-cell": `${item.index}:${columnIndex}`,
                      "data-row-index": rowIndex,
                      "data-field": column.key,
                    } as const;
                    const lookupState = lookups.state[column.key];

                    return (
                      <td
                        key={column.key}
                        className={`${BODY_CELL} focus-within:relative focus-within:z-[1] ${state}`}
                        title={cellIssues?.map((issue) => issue.message).join("\n")}
                        data-column={column.key}
                      >
                        {lookup && isEditable ? (
                          <LookupAutocomplete
                            rowIndex={rowIndex}
                            lookup={lookup}
                            records={lookup.options ?? lookups.records[column.key] ?? []}
                            value={value}
                            onValueChange={(text) =>
                              onEdit([{ rowIndex, field: column.key, text }])
                            }
                            isEnabled={!isReadOnly}
                            isLoading={!lookup.options && lookupState === "loading"}
                            error={
                              !lookup.options && lookupState === "unavailable"
                                ? `${lookup.label} unavailable`
                                : ""
                            }
                            isCompact={isCompact}
                            inputData={dataAttributes}
                            allowUnlistedCodes
                          />
                        ) : (
                          <input
                            {...dataAttributes}
                            className={`${CELL_INPUT} ${isCompact ? "px-0.5" : "px-1"}`}
                            type="text"
                            inputMode={isDepth ? "decimal" : undefined}
                            value={
                              isDepth
                                ? shownDepthText(depthDraft, rowIndex, column.key, value)
                                : value
                            }
                            readOnly={isReadOnly || !isEditable}
                            autoComplete="off"
                            aria-label={`${column.label}, record ${rowIndex + 1}`}
                            aria-invalid={severity === "error" || undefined}
                            onChange={(event) => {
                              const text = event.target.value;
                              if (isDepth) setDepthDraft({ rowIndex, field: column.key, text });
                              onEdit([{ rowIndex, field: column.key, text }]);
                            }}
                            onBlur={isDepth ? () => setDepthDraft(null) : undefined}
                          />
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}

            {paddingBottom > 0 && (
              <tr aria-hidden="true" data-spacer style={{ height: paddingBottom }}>
                <td colSpan={columnCount} />
              </tr>
            )}
          </tbody>
        </table>

        {visibleRows.length === 0 && (
          <p className="m-0 p-6 text-center text-[0.875rem] text-rl-text-muted">
            No records match the current search and filter.
          </p>
        )}
      </div>

      <p className="mt-1.5 mb-0 min-h-[1.2em] text-[0.8125rem] text-rl-text-muted" aria-live="polite">
        {notice}
      </p>
    </>
  );
}

export default UploadDataTable;
