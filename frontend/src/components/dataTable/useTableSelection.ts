import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  getCellRange,
  getCellRefFromElement,
  getFullySelectedRowIds,
  getRowCells,
  getRowRange,
  groupColumnsByRow,
  isSameCell,
  mergeCells,
  type CellRef,
} from "./tableSelection";

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
type DragState<K extends string> =
  | { mode: "cells"; anchor: CellRef<K>; last: CellRef<K>; base: CellRef<K>[]; active: boolean }
  | { mode: "rows"; anchorRowId: string; lastRowId: string; base: CellRef<K>[] };

interface TableSelectionOptions<K extends string> {
  /* Every row id in display order, including rows not rendered right now. */
  rowIds: readonly string[];
  /* The selectable columns, left to right. */
  columnKeys: readonly K[];
  /* The scrolling frame around the table (drag auto-scroll). */
  frameRef: React.RefObject<HTMLElement | null>;
  bodyRef: React.RefObject<HTMLTableSectionElement | null>;
  /* A dialog is open or the table is read-only: the mouse is ignored. */
  isBlocked: boolean;
  /*
   * Focuses a rendered cell without scrolling to rows that are not rendered;
   * returns false when the row is not in the DOM.
   */
  focusRenderedCell: (rowId: string, columnKey: K) => boolean;
}

/*
 * Excel-style mouse selection for a table that follows the DOM contract in
 * tableSelection.ts. A document mousedown listener covers presses outside
 * the table too (a plain press there clears the selection).
 *
 *   On a cell        press and drag to another cell selects the block;
 *                    Shift extends from the anchor, Ctrl adds a block or
 *                    toggles one cell.
 *   On a row number  click selects the row, Shift + click the rows between,
 *                    Ctrl + click adds / removes a row; dragging over the
 *                    numbers selects every row passed.
 *
 * Elements marked `data-keep-selection` (the selection bar) never clear it.
 */
export function useTableSelection<K extends string>({
  rowIds,
  columnKeys,
  frameRef,
  bodyRef,
  isBlocked,
  focusRenderedCell,
}: TableSelectionOptions<K>) {
  const [selectedCells, setSelectedCells] = useState<CellRef<K>[]>([]);
  // Where Shift + click ranges start: the last cell clicked or focused, and
  // the last row number clicked.
  const anchorCell = useRef<CellRef<K> | null>(null);
  const anchorRowId = useRef<string | null>(null);

  const rowIdSet = useMemo(() => new Set(rowIds), [rowIds]);

  // Cells of rows that no longer exist (deleted, filtered out, new document) drop out.
  useEffect(() => {
    setSelectedCells((current) => {
      const kept = current.filter((cell) => rowIdSet.has(cell.rowId));
      return kept.length === current.length ? current : kept;
    });
  }, [rowIdSet]);

  /*
   * Selected columns per row. A row whose columns did not change keeps its
   * previous Set, so a memoized row re-renders only when its own cells change.
   */
  const previousColumns = useRef(new Map<string, ReadonlySet<K>>());
  const selectedColumnsByRow = useMemo(() => {
    const grouped = groupColumnsByRow(selectedCells);
    const result = new Map<string, ReadonlySet<K>>();
    grouped.forEach((columns, rowId) => {
      const previous = previousColumns.current.get(rowId);
      const isSame =
        previous !== undefined &&
        previous.size === columns.size &&
        [...columns].every((column) => previous.has(column));
      result.set(rowId, isSame ? previous : columns);
    });
    previousColumns.current = result;
    return result as ReadonlyMap<string, ReadonlySet<K>>;
  }, [selectedCells]);

  const fullRowIds = useMemo(
    () =>
      selectedCells.length < columnKeys.length
        ? []
        : rowIds.filter((rowId) => selectedColumnsByRow.get(rowId)?.size === columnKeys.length),
    [columnKeys.length, rowIds, selectedCells.length, selectedColumnsByRow],
  );
  const fullRowIdSet = useMemo(() => new Set(fullRowIds), [fullRowIds]);
  const selectedRowCount = selectedColumnsByRow.size;
  // The selection is whole rows and nothing else.
  const isWholeRowSelection =
    fullRowIds.length > 0 && fullRowIds.length * columnKeys.length === selectedCells.length;

  // Read by the document listeners, which are registered once.
  const latest = useRef({ rowIds, columnKeys, selectedCells, isBlocked, focusRenderedCell });
  latest.current = { rowIds, columnKeys, selectedCells, isBlocked, focusRenderedCell };

  /*
   * Keeps focus in the table so Delete, Ctrl + C and Esc reach its handlers:
   * the wanted cell when it is rendered, else the same column of the first
   * row in view (never scrolling the table away from where the user is).
   */
  const focusInView = useCallback(
    (columnKey: K) => {
      const { focusRenderedCell: focusCell } = latest.current;
      const frameTop = frameRef.current?.getBoundingClientRect().top ?? 0;
      const rendered = Array.from(
        bodyRef.current?.querySelectorAll<HTMLTableRowElement>("tr[data-row-id]") ?? [],
      );
      const inView =
        rendered.find((row) => row.getBoundingClientRect().bottom > frameTop + 1) ?? rendered[0];
      const rowId = inView?.dataset.rowId;
      if (rowId !== undefined) focusCell(rowId, columnKey);
    },
    [bodyRef, frameRef],
  );
  const focusNear = useCallback(
    (cell: CellRef<K>) => {
      if (!latest.current.focusRenderedCell(cell.rowId, cell.columnKey)) {
        focusInView(cell.columnKey);
      }
    },
    [focusInView],
  );

  useEffect(() => {
    let drag: DragState<K> | null = null;
    let pointer = { x: 0, y: 0 };
    let scrollFrame = 0;

    const cellAt = (element: Element | null) =>
      getCellRefFromElement(element, latest.current.columnKeys);

    function elementAt(x: number, y: number) {
      const body = bodyRef.current;
      const element = document.elementFromPoint(x, y);
      return body && element && body.contains(element) ? element : null;
    }

    // Applies the drag to the pointer's current position.
    function updateDrag() {
      if (!drag) return;
      const { rowIds: ids, columnKeys: keys } = latest.current;
      const element = elementAt(pointer.x, pointer.y);

      if (drag.mode === "rows") {
        const rowId = element?.closest<HTMLTableRowElement>("tr[data-row-id]")?.dataset.rowId;
        if (rowId === undefined || rowId === drag.lastRowId) return;
        drag.lastRowId = rowId;
        setSelectedCells(mergeCells(drag.base, getRowRange(ids, keys, drag.anchorRowId, rowId)));
        return;
      }

      const cell = cellAt(element);
      if (!cell || isSameCell(cell, drag.last)) return;

      if (!drag.active) {
        drag.active = true;
        // From here on it is a cell selection, not text selection.
        const body = bodyRef.current;
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
      setSelectedCells(mergeCells(drag.base, getCellRange(ids, keys, drag.anchor, cell)));
    }

    // Scrolls the table while the pointer is held near its top or bottom edge.
    function autoScroll() {
      scrollFrame = 0;
      const frame = frameRef.current;
      if (!drag || !frame) return;
      if (drag.mode === "cells" && !drag.active) return;

      const bounds = frame.getBoundingClientRect();
      // Too small (or not laid out) to have edges worth scrolling from.
      if (bounds.height < AUTO_SCROLL_EDGE * 3) return;
      const delta =
        pointer.y < bounds.top + AUTO_SCROLL_EDGE
          ? -AUTO_SCROLL_STEP
          : pointer.y > bounds.bottom - AUTO_SCROLL_EDGE
            ? AUTO_SCROLL_STEP
            : 0;
      if (delta === 0) return;

      frame.scrollTop += delta;
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
      const body = bodyRef.current;
      if (body) body.style.userSelect = "";

      // The anchor stays where the drag started, as in Excel.
      if (finished.mode === "cells" && finished.active) {
        focusNear(finished.anchor);
        anchorCell.current = finished.anchor;
      }
    }

    function startDrag(state: DragState<K>, event: MouseEvent) {
      drag = state;
      pointer = { x: event.clientX, y: event.clientY };
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", endDrag);
    }

    function handleRowHeader(event: MouseEvent, rowId: string) {
      event.preventDefault();
      const { rowIds: ids, columnKeys: keys, selectedCells: current } = latest.current;
      const additive = event.ctrlKey || event.metaKey;

      if (
        additive && !event.shiftKey &&
        getFullySelectedRowIds([rowId], keys, current).length === 1
      ) {
        // Ctrl + click on a selected row takes it out of the selection.
        setSelectedCells(current.filter((item) => item.rowId !== rowId));
        anchorRowId.current = rowId;
        return;
      }

      const anchor =
        event.shiftKey && anchorRowId.current !== null && ids.includes(anchorRowId.current)
          ? anchorRowId.current
          : rowId;
      const base = additive ? current : [];
      anchorRowId.current = anchor;
      setSelectedCells(mergeCells(base, getRowRange(ids, keys, anchor, rowId)));
      // Focus a cell of the row, so Delete, Ctrl + C and Esc reach the table.
      const firstCell = getRowCells(rowId, keys)[0];
      if (firstCell) {
        latest.current.focusRenderedCell(rowId, firstCell.columnKey);
        anchorCell.current = firstCell;
      }
      startDrag({ mode: "rows", anchorRowId: anchor, lastRowId: rowId, base }, event);
    }

    function handleMouseDown(event: MouseEvent) {
      if (event.button !== 0 || latest.current.isBlocked) return;

      const target = event.target instanceof Element ? event.target : null;
      // The selection bar acts on the selection; pressing it must not clear
      // the selection first.
      if (target?.closest("[data-keep-selection]")) return;

      const body = bodyRef.current;
      const inBody = Boolean(body && target && body.contains(target));

      const rowHeader = inBody ? target?.closest("[data-row-number]") : null;
      const headerRowId = rowHeader?.closest<HTMLTableRowElement>("tr[data-row-id]")?.dataset.rowId;
      if (rowHeader && headerRowId !== undefined) {
        if (!rowHeader.querySelector("button:disabled")) handleRowHeader(event, headerRowId);
        return;
      }

      const cell = inBody ? cellAt(target) : null;
      const { rowIds: ids, columnKeys: keys, selectedCells: current } = latest.current;
      const additive = event.ctrlKey || event.metaKey;

      if (!cell) {
        if (!additive && !event.shiftKey && current.length > 0) setSelectedCells([]);
        return;
      }

      if (event.shiftKey) {
        event.preventDefault();
        const anchor =
          anchorCell.current && ids.includes(anchorCell.current.rowId)
            ? anchorCell.current
            : cell;
        const base = additive ? current : [];
        setSelectedCells(mergeCells(base, getCellRange(ids, keys, anchor, cell)));
        latest.current.focusRenderedCell(cell.rowId, cell.columnKey);
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
        latest.current.focusRenderedCell(cell.rowId, cell.columnKey);
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
  }, [bodyRef, focusNear, frameRef]);

  /* The No. header: every row. Focus stays near where the user is. */
  const selectAll = useCallback(() => {
    const { rowIds: ids, columnKeys: keys } = latest.current;
    const firstKey = keys[0];
    if (ids.length === 0 || firstKey === undefined) return;
    setSelectedCells(ids.flatMap((rowId) => getRowCells(rowId, keys)));
    anchorRowId.current = ids[0] ?? null;
    focusInView(firstKey);
  }, [focusInView]);

  const clearSelection = useCallback(() => setSelectedCells([]), []);

  /* Bind to the table body's onFocus: a focused cell becomes the Shift anchor. */
  const noteFocus = useCallback((target: EventTarget) => {
    anchorCell.current = getCellRefFromElement(target, latest.current.columnKeys) ?? anchorCell.current;
  }, []);

  return {
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
  };
}
