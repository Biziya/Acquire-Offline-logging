import type { RowField } from "../../types/domain";
import { useEffect, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { isRecord } from "../../types/validation";
import { canLeaveCell, isKeyAlreadyHandled } from "../RawLitho/tableNavigation";
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
}

interface CellPosition {
  /* Position in `visibleRows`, not the record index. */
  position: number;
  column: number;
}

// Same columns, widths and row height as Raw Litho, plus the Status column.
const { rowHeight, minWidth, indexColumnWidth } = rawLithoConfig;
const { overscan, maxHeightVh, statusColumnWidth } = uploadDataConfig;
const [indexWidth, statusWidth, ...columnWidths] = toPercentWidths([
  indexColumnWidth,
  statusColumnWidth,
  ...rawLithoConfig.columns
    .filter((column) => column.visible)
    .map((column) => column.width),
]);

// Strongest first: the Ctrl + click selection shows over error / warning.
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

function selectionKey(rowIndex: number, field: RowField) {
  return `${rowIndex}:${field}`;
}

function getCellPosition(target: EventTarget | null): CellPosition | null {
  const input =
    target instanceof Element ? target.closest<HTMLElement>("[data-cell]") : null;
  const [position, column] = (input?.dataset.cell ?? "").split(":").map(Number);

  return position === undefined || column === undefined || Number.isNaN(position + column)
    ? null
    : { position, column };
}

/*
 * The editable preview. Only the rows in view (plus `overscan`) are in the
 * DOM; every value is read from the working document on render, so an edit
 * survives its row scrolling out of view and back. Rows are keyed by their
 * record index, which never changes for a loaded file.
 */
function UploadDataTable({
  rows,
  visibleRows,
  validation,
  lookups,
  isReadOnly,
  onEdit,
}: UploadDataTableProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const pendingFocus = useRef<CellPosition | null>(null);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [notice, setNotice] = useState("");

  const virtualizer = useVirtualizer({
    count: visibleRows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => rowHeight,
    overscan,
    getItemKey: (position) => visibleRows[position] ?? position,
    initialRect: { width: minWidth, height: rowHeight * 20 },
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

  /*
   * Tab / Shift + Tab: next / previous cell, wrapping across records.
   * ArrowLeft / ArrowRight: the same, once the caret is at the edge of the text.
   * ArrowUp / ArrowDown and Enter: the same column in the previous / next record.
   * At either end of the table Tab leaves it as usual. Keys a lookup cell
   * already used (its list, or a move between rendered cells) are skipped.
   */
  function handleKeyDown(event: React.KeyboardEvent<HTMLTableSectionElement>) {
    if (event.key === "Escape") {
      setSelected(new Set());
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

  // Ctrl / ⌘ + click toggles a cell in the selection; a plain click on a cell
  // outside the selection clears it.
  function handleMouseDown(event: React.MouseEvent<HTMLTableSectionElement>) {
    if (event.button !== 0) return;
    const input =
      event.target instanceof Element
        ? event.target.closest<HTMLInputElement>("input[data-cell]")
        : null;
    if (!input) return;

    const key = selectionKey(
      Number(input.dataset.rowIndex),
      input.dataset.field as RowField,
    );

    if (event.ctrlKey || event.metaKey) {
      event.preventDefault();
      input.focus();
      setSelected((current) => {
        const next = new Set(current);
        if (!next.delete(key)) next.add(key);
        return next;
      });
    } else if (!selected.has(key) && selected.size > 0) {
      setSelected(new Set());
    }
  }

  /*
   * Ctrl + C with a selection copies its bounding rectangle (display order) as
   * tab-separated text; unselected cells inside it are written empty.
   */
  function handleCopy(event: React.ClipboardEvent<HTMLTableSectionElement>) {
    if (selected.size === 0) return;

    const positionByRow = new Map(visibleRows.map((row, position) => [row, position]));
    const cells = Array.from(selected).flatMap((key) => {
      const [rowText, field] = key.split(":");
      const position = positionByRow.get(Number(rowText));
      const column = columns.findIndex((item) => item.key === field);
      return position === undefined || column === -1 ? [] : [{ position, column }];
    });
    if (cells.length === 0) return;

    const positions = cells.map((cell) => cell.position);
    const cols = cells.map((cell) => cell.column);
    const [top, bottom] = [Math.min(...positions), Math.max(...positions)];
    const [left, right] = [Math.min(...cols), Math.max(...cols)];

    const lines: string[] = [];
    for (let position = top; position <= bottom; position += 1) {
      const rowIndex = visibleRows[position] ?? -1;
      const values: string[] = [];
      for (let column = left; column <= right; column += 1) {
        const field = columns[column]?.key;
        values.push(
          field && selected.has(selectionKey(rowIndex, field))
            ? cellText(rows[rowIndex], field).replace(/[\t\r\n]+/g, " ")
            : "",
        );
      }
      lines.push(values.join("\t"));
    }

    event.preventDefault();
    event.clipboardData.setData("text/plain", lines.join("\n"));
    setNotice(`Copied ${cells.length} cell${cells.length === 1 ? "" : "s"}.`);
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
      if (selected.size === 0) return;
      event.preventDefault();
      setNotice("The clipboard could not be read; nothing was changed.");
      return;
    }

    const grid = parseClipboardText(text);
    const isBlock = grid.length > 1 || (grid[0]?.length ?? 0) > 1;
    const edits: CellEdit[] = [];

    if (!isBlock && selected.size > 0) {
      const text = grid[0]?.[0] ?? "";
      selected.forEach((key) => {
        const [rowText, field] = key.split(":");
        edits.push({ rowIndex: Number(rowText), field: field as RowField, text });
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

    // Cells holding a JSON object or list are shown read-only and never pasted over.
    const writable = edits.filter((edit) => {
      const row = rows[edit.rowIndex];
      return isRecord(row) && isEditableValue(row[edit.field]);
    });
    const skipped = edits.length - writable.length;

    onEdit(writable);
    setNotice(
      `Pasted into ${writable.length} cell${writable.length === 1 ? "" : "s"}.` +
        (skipped > 0 ? ` ${skipped} read-only cell${skipped === 1 ? " was" : "s were"} left unchanged.` : ""),
    );
  }

  const items = virtualizer.getVirtualItems();
  const paddingTop = items[0]?.start ?? 0;
  const paddingBottom =
    virtualizer.getTotalSize() - (items[items.length - 1]?.end ?? 0);
  const columnCount = columns.length + 2;

  return (
    <>
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
              <th className={HEADER_CELL} style={{ width: indexWidth }}>
                Ins
              </th>
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
            onKeyDown={handleKeyDown}
            onMouseDown={handleMouseDown}
            onCopy={handleCopy}
            onPaste={handlePaste}
          >
            {paddingTop > 0 && (
              <tr aria-hidden="true" style={{ height: paddingTop }}>
                <td colSpan={columnCount} />
              </tr>
            )}

            {items.map((item) => {
              const rowIndex = visibleRows[item.index];
              if (rowIndex === undefined) return null;

              const row = rows[rowIndex];
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
                >
                  <td className={BODY_CELL}>{rowIndex + 1}</td>
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
                    const isSelected = selected.has(
                      selectionKey(rowIndex, column.key),
                    );
                    const state = isSelected
                      ? CELL_STATES.selected
                      : (severity && CELL_STATES[severity]) || CELL_STATES.normal;
                    const isEditable =
                      isRecord(row) && isEditableValue(row[column.key]);
                    const lookup = RAW_LITHO_LOOKUP_BY_FIELD[column.key];
                    const isCompact = COMPACT_COLUMN_KEYS.has(column.key);
                    const value = cellText(row, column.key);
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
                          />
                        ) : (
                          <input
                            {...dataAttributes}
                            className={`${CELL_INPUT} ${isCompact ? "px-0.5" : "px-1"}`}
                            type="text"
                            inputMode={
                              column.key === "lithoFrom" || column.key === "lithoTo"
                                ? "decimal"
                                : undefined
                            }
                            value={value}
                            readOnly={isReadOnly || !isEditable}
                            autoComplete="off"
                            aria-label={`${column.label}, record ${rowIndex + 1}`}
                            aria-invalid={severity === "error" || undefined}
                            onChange={(event) =>
                              onEdit([
                                { rowIndex, field: column.key, text: event.target.value },
                              ])
                            }
                          />
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}

            {paddingBottom > 0 && (
              <tr aria-hidden="true" style={{ height: paddingBottom }}>
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
