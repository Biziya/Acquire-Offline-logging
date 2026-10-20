import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import type { RowId } from "../../types/domain";
type TableKeyEvent = KeyboardEvent | ReactKeyboardEvent<HTMLElement>;

export const EDITABLE_SELECTOR = [
  'input:not([disabled]):not([type="hidden"])',
  "select:not([disabled])",
  "textarea:not([disabled])",
].join(", ");

const VERTICAL_KEYS = new Set(["ArrowUp", "ArrowDown"]);

let isMovingFocus = false;

export function isNavigationFocus() {
  return isMovingFocus;
}

/*
 * Cell-level handlers (arrow navigation, the lookup dropdown) run before the
 * table-level handler that creates rows, because keydown bubbles up from the
 * input. They mark the event once they have used the key so the table handler
 * can leave it alone instead of guessing from `defaultPrevented`.
 */
const handledKeys = new WeakSet<Event>();

function getNativeEvent(event: TableKeyEvent): Event {
  return "nativeEvent" in event ? event.nativeEvent : event;
}

export function markKeyAsHandled(event: TableKeyEvent) {
  const nativeEvent = getNativeEvent(event);

  if (nativeEvent) {
    handledKeys.add(nativeEvent);
  }
}

export function isKeyAlreadyHandled(event: TableKeyEvent) {
  return handledKeys.has(getNativeEvent(event));
}

function focusElement(target: Element | null | undefined) {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  isMovingFocus = true;

  try {
    target.focus();

    try {
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement
      )
        target.select();
    } catch {
      /* Inputs such as type="number" may reject select(). */
    }
  } finally {
    isMovingFocus = false;
  }

  return true;
}

function focusEditable(cell: Element | null | undefined) {
  return focusElement(cell?.querySelector(EDITABLE_SELECTOR));
}

/*
 * Moves to the previous / next editable cell of the rendered page, in reading
 * order: past the end of a row it continues on the next row, and before the
 * start of a row on the previous one. Disabled cells are skipped. Returns false
 * at the edge of the page, where the table decides what happens next.
 */
function moveHorizontally(cell: HTMLTableCellElement, step: number) {
  const tbody = cell.closest("tbody");
  const current = cell.querySelector(EDITABLE_SELECTOR);
  if (!tbody || !current) return false;

  const editables = Array.from(tbody.querySelectorAll(EDITABLE_SELECTOR));
  const index = editables.indexOf(current);
  if (index === -1) return false;

  return focusElement(editables[index + step]);
}

function moveVertically(cell: HTMLTableCellElement, step: number) {
  const row = cell.parentElement;

  if (!row) {
    return false;
  }

  const columnIndex = cell.cellIndex;
  let candidateRow =
    step > 0 ? row.nextElementSibling : row.previousElementSibling;

  while (candidateRow) {
    if (
      candidateRow instanceof HTMLTableRowElement &&
      focusEditable(candidateRow.cells[columnIndex])
    ) {
      return true;
    }

    candidateRow =
      step > 0
        ? candidateRow.nextElementSibling
        : candidateRow.previousElementSibling;
  }

  return false;
}

/*
 * Moves focus to the neighbouring cell without asking whether the caret is
 * free to leave. Used by the lookup cell after it has accepted a suggestion:
 * the value is settled, so the caret position no longer matters.
 */
export function moveFocusHorizontally(
  element: EventTarget | null,
  step: number,
) {
  const cell = element instanceof Element ? element.closest("td") : null;

  if (!cell) {
    return false;
  }

  return moveHorizontally(cell, step);
}

export function canLeaveCell(element: EventTarget | null, step: number) {
  if (!(
    element instanceof HTMLInputElement ||
    element instanceof HTMLTextAreaElement
  )) {
    return true;
  }

  let selectionStart: number | null;
  let selectionEnd: number | null;

  try {
    selectionStart = element.selectionStart;
    selectionEnd = element.selectionEnd;
  } catch {
    return true;
  }

  if (selectionStart === null || selectionStart !== selectionEnd) {
    return selectionStart === null;
  }

  return step < 0
    ? selectionStart === 0
    : selectionStart === String(element.value ?? "").length;
}

export function shouldClearCell(element: EventTarget | null) {
  if (!(
    element instanceof HTMLInputElement ||
    element instanceof HTMLTextAreaElement
  )) {
    return true;
  }

  const value = String(element.value ?? "");

  if (value === "") {
    return true;
  }

  let selectionStart: number | null;
  let selectionEnd: number | null;

  try {
    selectionStart = element.selectionStart;
    selectionEnd = element.selectionEnd;
  } catch {
    return true;
  }

  if (selectionStart === null || selectionEnd === null) {
    return true;
  }

  const isWholeValueSelected =
    selectionStart === 0 && selectionEnd === value.length;
  const isCaretAtEnd =
    selectionStart === selectionEnd && selectionStart === value.length;

  return isWholeValueSelected || isCaretAtEnd;
}

export function isClearCellRequest(event: TableKeyEvent) {
  if (event.key !== "Delete") {
    return false;
  }

  if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) {
    return false;
  }

  return shouldClearCell(event.target);
}

/*
 * Horizontal direction requested by a key: 1 forward, -1 backward, 0 none.
 *
 * Tab and Shift + Tab always leave the cell. ArrowRight / ArrowLeft only leave
 * it once the caret has reached that edge of the text, so they still move the
 * caret while editing. Both the cell handler and the table handler ask this
 * one function, so the four keys can never drift apart.
 */
export function getHorizontalStep(event: TableKeyEvent) {
  if (event.altKey || event.ctrlKey || event.metaKey) return 0;

  if (event.key === "Tab") return event.shiftKey ? -1 : 1;
  if (event.shiftKey) return 0;

  const step =
    event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;

  return step !== 0 && canLeaveCell(event.target, step) ? step : 0;
}

/*
 * Arrow keys, Tab and Shift + Tab inside a cell. Returns true and marks the
 * event when focus moved. When it returns false at the edge of the page, the
 * event bubbles to the table, which changes page or appends a row.
 */
export function handleCellNavigation(event: TableKeyEvent) {
  const element = event.target;
  const cell = element instanceof Element ? element.closest("td") : null;

  if (!cell) {
    return false;
  }

  if (VERTICAL_KEYS.has(event.key)) {
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) {
      return false;
    }

    if (element instanceof HTMLInputElement && element.type === "number") {
      event.preventDefault();
    }

    if (moveVertically(cell, event.key === "ArrowDown" ? 1 : -1)) {
      event.preventDefault();
      markKeyAsHandled(event);
      return true;
    }

    return false;
  }

  const step = getHorizontalStep(event);

  if (step === 0 || !moveHorizontally(cell, step)) {
    return false;
  }

  event.preventDefault();
  markKeyAsHandled(event);
  return true;
}

export function isRowEndTab(
  event: TableKeyEvent,
  tbody: HTMLTableSectionElement | null,
) {
  if (event.key !== "Tab" || event.shiftKey) return false;
  if (event.altKey || event.ctrlKey || event.metaKey) return false;
  if (!tbody) return false;

  const lastRow = tbody.rows?.[tbody.rows.length - 1];
  if (!lastRow) return false;

  const editables = lastRow.querySelectorAll(EDITABLE_SELECTOR);
  return (
    editables.length > 0 && editables[editables.length - 1] === event.target
  );
}

/*
 * ArrowDown pressed inside the last rendered row. The caller has already
 * checked `isKeyAlreadyHandled`, so reaching here means no cell below exists
 * and the lookup dropdown did not want the key either.
 */
export function isLastRowArrowDown(
  event: TableKeyEvent,
  tbody: HTMLTableSectionElement | null,
) {
  if (event.key !== "ArrowDown") return false;
  if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) {
    return false;
  }
  if (!tbody) return false;

  const lastRow = tbody.rows?.[tbody.rows.length - 1];
  if (!lastRow) return false;

  return (
    event.target instanceof Element && event.target.closest("tr") === lastRow
  );
}

/* Either key that appends a row from the end of the last rendered row. */
export function isRowCreationKey(
  event: TableKeyEvent,
  tbody: HTMLTableSectionElement | null,
) {
  return isRowEndTab(event, tbody) || isLastRowArrowDown(event, tbody);
}

function focusFirstEditableInRow(row: Element | null) {
  return focusElement(row?.querySelector(EDITABLE_SELECTOR));
}

/*
 * Focuses one column of the row carrying `rowId`.
 *
 * Rows are addressed by their stable id rather than by position, because
 * reordering by Litho From changes positions while the caret has to stay with
 * the same logical row. Falls back to the row's first editable cell when the
 * requested column is not currently displayed, and returns false when the row
 * is not rendered on this page.
 */
export function focusCellInRow(
  tbody: HTMLTableSectionElement | null,
  rowId: RowId,
  columnKey: string | null = null,
) {
  if (!tbody || rowId === null || rowId === undefined) return false;

  const row = Array.from(tbody.rows).find(
    (item) => item.dataset.rowId === String(rowId),
  );
  if (!row) return false;

  const cell = columnKey
    ? Array.from(row.cells).find((item) => item.dataset.column === columnKey)
    : null;

  return focusEditable(cell) || focusFirstEditableInRow(row);
}

/* Row id of the rendered row containing `element`, or null. */
export function getRowIdFromElement(element: EventTarget | null) {
  const row =
    element instanceof Element ? element.closest("tr[data-row-id]") : null;
  if (!(row instanceof HTMLTableRowElement)) return null;

  return row.dataset.rowId ?? null;
}

/* Column key of the rendered cell containing `element`, or null. */
export function getColumnKeyFromElement(element: EventTarget | null) {
  const cell =
    element instanceof Element ? element.closest("td[data-column]") : null;

  return cell instanceof HTMLTableCellElement
    ? (cell.dataset.column ?? null)
    : null;
}

/*
 * True when focus was dropped rather than moved on purpose.
 *
 * Reordering rows makes React move the <tr>, and browsers clear focus when a
 * focused element is relocated: `activeElement` falls back to <body>. A
 * deliberate move (clicking Save, tabbing to a button) leaves a real element
 * focused, which must not be stolen back.
 */
export function hasLostFocus(ownerDocument = document) {
  const activeElement = ownerDocument.activeElement;

  return !activeElement || activeElement === ownerDocument.body;
}
