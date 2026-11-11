import type { RowField } from "../../types/domain";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useVirtualizer } from "@tanstack/react-virtual";
import { isRecord } from "../../types/validation";
import { canLeaveCell } from "../RawLitho/tableNavigation";
import { parseClipboardText } from "../RawLitho/rawLithoClipboard";
import { cellText, isEditableValue, type CellEdit } from "./uploadDataDocument";
import type { RowStatus, UploadValidation } from "./uploadDataValidation";
import { uploadDataConfig } from "./config";
import {
  BODY_CELL,
  HEADER_CELL,
  TABLE,
  TABLE_FRAME,
  bodyRowClass,
  toPercentWidths,
} from "../../components/dataTableStyles";
import {
  DROPDOWN_OPTION_ACTIVE,
  DROPDOWN_OPTION_HOVER,
  TABLE_DROPDOWN_MENU,
  TABLE_DROPDOWN_OPTION,
} from "../../components/dropdownStyles";
import { useAnchoredMenuStyle } from "../../components/useAnchoredMenuStyle";

interface UploadDataTableProps {
  rows: readonly unknown[];
  /* Indices into `rows`, in display order, after search and filter. */
  visibleRows: readonly number[];
  validation: UploadValidation | null;
  lookupOptions: Partial<Record<RowField, readonly string[]>>;
  isReadOnly: boolean;
  onEdit: (edits: CellEdit[]) => void;
}

interface CellPosition {
  /* Position in `visibleRows`, not the record index. */
  position: number;
  column: number;
}

const {
  columns,
  rowHeight,
  overscan,
  maxHeightVh,
  minWidth,
  indexColumnWidth,
  statusColumnWidth,
} = uploadDataConfig;

// Configured widths are proportions: the table always fills the section.
const [indexWidth, statusWidth, ...columnWidths] = toPercentWidths([
  indexColumnWidth,
  statusColumnWidth,
  ...columns.map((column) => column.width),
]);

// Strongest first: the Ctrl + click selection shows over error / warning.
const CELL_STATES = {
  selected:
    "upload-cell--selected bg-[#dbeafe] shadow-[inset_0_0_0_2px_#2563eb]",
  error:
    "upload-cell--error bg-rl-danger-soft shadow-[inset_0_0_0_2px_var(--color-rl-required-soft)] focus-within:shadow-[inset_0_0_0_2px_var(--color-rl-cell-ring),inset_0_0_0_4px_rgb(192_57_47/32%)]",
  warning:
    "upload-cell--warning bg-rl-warning-soft shadow-[inset_0_0_0_2px_var(--color-rl-warning-border)] focus-within:shadow-[inset_0_0_0_2px_var(--color-rl-cell-ring),inset_0_0_0_4px_rgb(232_194_122/60%)]",
  normal:
    "focus-within:bg-white focus-within:shadow-[inset_0_0_0_2px_var(--color-rl-cell-ring)]",
};

const STATUS_MARKS: Record<RowStatus, { glyph: string; className: string; text: string }> = {
  valid: { glyph: "✓", className: "text-rl-success", text: "Valid" },
  warning: { glyph: "!", className: "text-rl-warning", text: "Warning" },
  error: { glyph: "✕", className: "text-rl-danger", text: "Invalid" },
};

const LOOKUP_MENU_ID = "upload-data-lookup-menu";

// The cell whose lookup menu is open, by record and field so a filter change
// cannot move the menu to another cell.
interface OpenMenu {
  rowIndex: number;
  field: RowField;
}

function normalize(text: string) {
  return text.trim().toLocaleLowerCase();
}

/*
 * The options the lookup menu lists for a cell: all of them while the cell is
 * empty or holds an exact code, otherwise the codes containing the typed text
 * (what the browser's <datalist> suggested before).
 */
function matchingOptions(options: readonly string[], text: string) {
  const query = normalize(text);
  if (!query || options.some((option) => normalize(option) === query)) return options;
  return options.filter((option) => normalize(option).includes(query));
}

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
  lookupOptions,
  isReadOnly,
  onEdit,
}: UploadDataTableProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const pendingFocus = useRef<CellPosition | null>(null);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [notice, setNotice] = useState("");
  const [openMenu, setOpenMenu] = useState<OpenMenu | null>(null);

  const getMenuAnchor = useCallback(
    () =>
      openMenu
        ? scrollRef.current?.querySelector<HTMLElement>(
            `input[data-row-index="${openMenu.rowIndex}"][data-field="${openMenu.field}"]`,
          ) ?? null
        : null,
    [openMenu],
  );
  // Closes when the row scrolls out of the virtualised window.
  const closeMenu = useCallback(() => setOpenMenu(null), []);
  const menuStyle = useAnchoredMenuStyle(Boolean(openMenu), getMenuAnchor, closeMenu);

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
   * At either end of the table Tab leaves it as usual.
   */
  function handleKeyDown(event: React.KeyboardEvent<HTMLTableSectionElement>) {
    if (event.key === "Escape") {
      setSelected(new Set());
      setOpenMenu(null);
      return;
    }
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

  // Raw Litho's lookup menu look, portalled so the table frame never clips it.
  function renderLookupMenu({ rowIndex, field }: OpenMenu) {
    const value = cellText(rows[rowIndex], field);
    const options = matchingOptions(lookupOptions[field] ?? [], value);
    if (options.length === 0) return null;

    return createPortal(
      <ul
        id={LOOKUP_MENU_ID}
        className={TABLE_DROPDOWN_MENU}
        role="listbox"
        style={menuStyle}
      >
        {options.map((option) => {
          const isCurrent = normalize(option) === normalize(value);
          return (
            <li
              key={option}
              className={`${TABLE_DROPDOWN_OPTION} cursor-pointer ${DROPDOWN_OPTION_HOVER}${
                isCurrent ? ` ${DROPDOWN_OPTION_ACTIVE}` : ""
              }`}
              role="option"
              aria-selected={isCurrent}
              onMouseDown={(event) => {
                // Keep focus in the cell, as Raw Litho does.
                event.preventDefault();
                setOpenMenu(null);
                if (option !== value) onEdit([{ rowIndex, field, text: option }]);
              }}
            >
              {option}
            </li>
          );
        })}
      </ul>,
      document.body,
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
                #
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
                  <td className={`${BODY_CELL} text-rl-text-muted`}>{rowIndex + 1}</td>
                  <td
                    className={`${BODY_CELL} font-bold ${mark?.className ?? ""}`}
                    title={messages.join("\n") || mark?.text}
                  >
                    {mark && (
                      <>
                        <span aria-hidden="true">{mark.glyph}</span>
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
                    const hasOptions = Boolean(lookupOptions[column.key]?.length);
                    const canOpenMenu = hasOptions && isEditable && !isReadOnly;
                    const isMenuOpen =
                      openMenu?.rowIndex === rowIndex && openMenu.field === column.key;

                    return (
                      <td
                        key={column.key}
                        className={`${BODY_CELL} focus-within:relative focus-within:z-[1] ${state}`}
                        title={cellIssues?.map((issue) => issue.message).join("\n")}
                      >
                        <input
                          className={`h-full w-full min-w-0 border-0 bg-transparent px-1 text-[0.78rem] text-rl-text outline-none read-only:text-rl-text-muted focus:font-[550] focus:text-[#0f172a] ${
                            column.key === "lithologyComments" ? "text-left" : "text-center"
                          }`}
                          type="text"
                          inputMode={
                            column.key === "lithoFrom" || column.key === "lithoTo"
                              ? "decimal"
                              : undefined
                          }
                          value={cellText(row, column.key)}
                          readOnly={isReadOnly || !isEditable}
                          role={hasOptions ? "combobox" : undefined}
                          aria-autocomplete={hasOptions ? "list" : undefined}
                          aria-expanded={hasOptions ? isMenuOpen : undefined}
                          aria-controls={isMenuOpen ? LOOKUP_MENU_ID : undefined}
                          autoComplete="off"
                          aria-label={`${column.label}, record ${rowIndex + 1}`}
                          aria-invalid={severity === "error" || undefined}
                          data-cell={`${item.index}:${columnIndex}`}
                          data-row-index={rowIndex}
                          data-field={column.key}
                          onChange={(event) => {
                            onEdit([
                              { rowIndex, field: column.key, text: event.target.value },
                            ]);
                            if (canOpenMenu) setOpenMenu({ rowIndex, field: column.key });
                          }}
                          onClick={(event) => {
                            if (canOpenMenu && !event.ctrlKey && !event.metaKey) {
                              setOpenMenu({ rowIndex, field: column.key });
                            }
                          }}
                          onBlur={() => {
                            if (isMenuOpen) setOpenMenu(null);
                          }}
                        />
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
          <p className="m-0 p-6 text-center text-[0.85rem] text-rl-text-muted">
            No records match the current search and filter.
          </p>
        )}
      </div>

      <p className="mt-1.5 mb-0 min-h-[1.2em] text-[0.78rem] text-rl-text-muted" aria-live="polite">
        {notice}
      </p>

      {openMenu && renderLookupMenu(openMenu)}
    </>
  );
}

export default UploadDataTable;
