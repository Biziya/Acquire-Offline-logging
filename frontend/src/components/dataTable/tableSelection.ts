/*
 * Cell selection for the editable tables (Raw Litho, Upload Data).
 *
 * Pure helpers. A cell is addressed by its row id (a string) and column key,
 * never by DOM position, so a selection survives sorting and virtualized rows
 * leaving the DOM. Ranges follow the order of `rowIds` (the display order)
 * and of `columnKeys` (the selectable columns, left to right).
 *
 * The DOM contract the tables follow, read by `getCellRefFromElement` and by
 * `useTableSelection`:
 *   tr[data-row-id]       one data row
 *   td[data-column]       one selectable cell, named by its column key
 *   td[data-row-number]   the row header (click / drag selects rows)
 */

export interface CellRef<K extends string = string> {
  rowId: string;
  columnKey: K;
}

export function isSameCell(first: CellRef, second: CellRef) {
  return first.rowId === second.rowId && first.columnKey === second.columnKey;
}

/*
 * Every cell of the rectangle between two cells, inclusive. Empty when
 * either corner is unknown.
 */
export function getCellRange<K extends string>(
  rowIds: readonly string[],
  columnKeys: readonly K[],
  anchor: CellRef<K>,
  target: CellRef<K>,
): CellRef<K>[] {
  const rowIndexes = [rowIds.indexOf(anchor.rowId), rowIds.indexOf(target.rowId)];
  const columnIndexes = [
    columnKeys.indexOf(anchor.columnKey),
    columnKeys.indexOf(target.columnKey),
  ];
  if ([...rowIndexes, ...columnIndexes].some((index) => index === -1)) return [];

  const columns = columnKeys.slice(Math.min(...columnIndexes), Math.max(...columnIndexes) + 1);
  return rowIds
    .slice(Math.min(...rowIndexes), Math.max(...rowIndexes) + 1)
    .flatMap((rowId) => columns.map((columnKey) => ({ rowId, columnKey })));
}

/* Every selectable cell of one row. */
export function getRowCells<K extends string>(
  rowId: string,
  columnKeys: readonly K[],
): CellRef<K>[] {
  return columnKeys.map((columnKey) => ({ rowId, columnKey }));
}

/* Every cell of every row between two rows, inclusive. Empty when a row is unknown. */
export function getRowRange<K extends string>(
  rowIds: readonly string[],
  columnKeys: readonly K[],
  anchorRowId: string,
  targetRowId: string,
): CellRef<K>[] {
  const indexes = [rowIds.indexOf(anchorRowId), rowIds.indexOf(targetRowId)];
  if (indexes.some((index) => index === -1)) return [];

  return rowIds
    .slice(Math.min(...indexes), Math.max(...indexes) + 1)
    .flatMap((rowId) => getRowCells(rowId, columnKeys));
}

/* The selected column keys of each row. */
export function groupColumnsByRow<K extends string>(selection: readonly CellRef<K>[]) {
  const columnsByRow = new Map<string, Set<K>>();
  selection.forEach(({ rowId, columnKey }) => {
    const columns = columnsByRow.get(rowId);
    if (columns) columns.add(columnKey);
    else columnsByRow.set(rowId, new Set([columnKey]));
  });
  return columnsByRow;
}

/* Rows (in `rowIds` order) whose every selectable cell is in `selection`. */
export function getFullySelectedRowIds<K extends string>(
  rowIds: readonly string[],
  columnKeys: readonly K[],
  selection: readonly CellRef<K>[],
): string[] {
  const columnsByRow = groupColumnsByRow(selection);
  return rowIds.filter((rowId) => columnsByRow.get(rowId)?.size === columnKeys.length);
}

/* Merges a cell list with more cells, keeping each cell once. */
export function mergeCells<K extends string>(
  base: readonly CellRef<K>[],
  added: readonly CellRef<K>[],
): CellRef<K>[] {
  if (base.length === 0) return [...added];
  const seen = new Set(base.map((cell) => `${cell.rowId}\u0000${cell.columnKey}`));
  const merged = [...base];
  added.forEach((cell) => {
    const key = `${cell.rowId}\u0000${cell.columnKey}`;
    if (seen.has(key)) return;
    seen.add(key);
    merged.push(cell);
  });
  return merged;
}

/* "1 row", "3 rows". */
export function countLabel(count: number, noun: string) {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

/* 1-based row numbers as short ranges: [4, 5, 6, 9] → "4–6, 9". */
export function formatRowNumbers(numbers: readonly number[]) {
  const sorted = [...new Set(numbers)].sort((first, second) => first - second);
  const parts: string[] = [];

  for (let index = 0; index < sorted.length; ) {
    const start = sorted[index] as number;
    let end = start;
    while (sorted[index + 1] === end + 1) {
      end += 1;
      index += 1;
    }
    parts.push(start === end ? String(start) : `${start}–${end}`);
    index += 1;
  }

  return parts.join(", ");
}

/* The selectable cell containing `element`, or null outside the data columns. */
export function getCellRefFromElement<K extends string>(
  element: EventTarget | null,
  columnKeys: readonly K[],
): CellRef<K> | null {
  if (!(element instanceof Element)) return null;
  const rowId = element.closest<HTMLTableRowElement>("tr[data-row-id]")?.dataset.rowId;
  const column = element.closest<HTMLTableCellElement>("td[data-column]")?.dataset.column;
  const columnKey = columnKeys.find((key) => key === column);

  return rowId === undefined || !columnKey ? null : { rowId, columnKey };
}
