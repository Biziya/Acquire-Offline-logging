import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import type { RowId } from "../../types/domain";
type TableKeyEvent = KeyboardEvent | ReactKeyboardEvent<HTMLElement>;

export const EDITABLE_SELECTOR = [
  'input:not([disabled]):not([readonly]):not([type="hidden"])',
  "select:not([disabled])",
  "textarea:not([disabled]):not([readonly])",
].join(", ");

const VERTICAL_KEYS = new Set(["ArrowUp", "ArrowDown"]);

// One primary editor per logical cell. Secondary inputs, triggers, and wrappers
// must never become additional stops when moving through the table.
export function getEditableElements(root: Element): HTMLElement[] {
  const visibility = new Map<Element, boolean>();
  function isVisible(element: Element): boolean {
    const cached = visibility.get(element);
    if (cached !== undefined) return cached;
    const style = getComputedStyle(element);
    const visible = !element.matches('[hidden], [inert], [aria-hidden="true"]') &&
      style.display !== "none" && style.visibility !== "hidden" && style.visibility !== "collapse" &&
      (!element.parentElement || isVisible(element.parentElement));
    visibility.set(element, visible);
    return visible;
  }
  const cells = new Set<Element>();
  return Array.from(root.querySelectorAll<HTMLElement>(EDITABLE_SELECTOR)).filter(
    element => !element.matches(':disabled, [aria-disabled="true"], [aria-readonly="true"]') &&
      element.tabIndex >= 0 && isVisible(element),
  ).filter(element => {
    const cell = element.closest("td");
    if (!cell) return true;
    if (cells.has(cell)) return false;
    cells.add(cell);
    return true;
  });
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
  // An already satisfied focus request must not fall through to a row fallback.
  if (target === target.ownerDocument.activeElement) return true;

  target.focus();
  if (target.ownerDocument.activeElement !== target) return false;

  try {
    if (
      target instanceof HTMLInputElement ||
      target instanceof HTMLTextAreaElement
    )
      target.select();
  } catch {
    /* Inputs such as type="number" may reject select(). */
  }
  target.scrollIntoView?.({ block: "nearest", inline: "nearest" });

  return true;
}

function focusEditable(cell: Element | null | undefined) {
  return focusElement(cell && getEditableElements(cell)[0]);
}

/*
 * Moves to the previous / next editable cell of the rendered page, in reading
 * order: past the end of a row it continues on the next row, and before the
 * start of a row on the previous one. Disabled cells are skipped. Returns false
 * at the edge of the page, where the table decides what happens next.
 */
function moveHorizontally(cell: HTMLTableCellElement, step: number) {
  const tbody = cell.closest("tbody");
  if (!tbody) return false;

  const editables = getEditableElements(tbody);
  const index = editables.findIndex(editor => editor.closest("td") === cell);
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

export function canLeaveCell(
  element: EventTarget | null,
  step: number,
  allowWholeValueSelection = false,
) {
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

  if (selectionStart === null) return true;
  // Table navigation selects the destination's whole value. That selection
  // must allow the next arrow to move immediately, without collapsing it first.
  if (selectionStart !== selectionEnd)
    return allowWholeValueSelection && selectionStart === 0 && selectionEnd === element.value.length;

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

  return step !== 0 && canLeaveCell(event.target, step, true) ? step : 0;
}

/*
 * Arrow keys, Tab and Shift + Tab inside a cell. Returns true and marks the
 * event when focus moved. When it returns false at the edge of the page, the
 * event bubbles to the table, which changes page, wraps Shift + Tab backward,
 * or appends a row with forward Tab / ArrowDown.
 */
export function handleCellNavigation(event: TableKeyEvent) {
  if (isKeyAlreadyHandled(event)) return true;
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

  const editables = getEditableElements(row);
  return focusEditable(cell) || focusElement(
    cell === row.lastElementChild ? editables.at(-1) : editables[0],
  );
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
