import {
  HELPER_TEXT,
  ICON_BUTTON,
  OUTLINE_BUTTON,
  OUTLINE_BUTTON_DISABLED,
  SMALL_BUTTON,
} from "../uiStyles";
import { countLabel } from "./tableSelection";

interface SelectionBarProps {
  /* Number of selected cells; 0 shows the hint instead of actions. */
  cellCount: number;
  /* Rows touched by the selection. */
  rowCount: number;
  /* Row numbers (1-based) when the selection is exactly whole rows, else empty. */
  wholeRowNumbers: string;
  wholeRowCount: number;
  isEnabled: boolean;
  onClearValues?: () => void;
  onDeleteRows?: () => void;
  onDismiss: () => void;
  /* What a row is called in this table ("row", "record"). */
  rowNoun?: string;
  /* Shown while nothing is selected. */
  hint?: string;
}

const DANGER_SMALL_BUTTON = [
  `${OUTLINE_BUTTON} ${OUTLINE_BUTTON_DISABLED} inline-flex h-7 items-center px-2.5 text-[0.75rem]`,
  "text-rl-danger enabled:hover:border-rl-danger enabled:hover:bg-rl-danger-soft",
].join(" ");

/*
 * The strip above an editable table. With nothing selected it says how to
 * select; with a selection it names it and offers what can be done with it.
 * It keeps the same height either way, so the table never moves when a
 * selection starts. `data-keep-selection` stops the table's mousedown
 * listener from clearing the selection before a button here is clicked.
 */
function SelectionBar({
  cellCount,
  rowCount,
  wholeRowNumbers,
  wholeRowCount,
  isEnabled,
  onClearValues,
  onDeleteRows,
  onDismiss,
  rowNoun = "row",
  hint = `Click a ${rowNoun} number to select ${rowNoun}s · drag across cells to select a block`,
}: SelectionBarProps) {
  const hasSelection = cellCount > 0;
  const isWholeRows = wholeRowCount > 0;

  return (
    <div
      data-keep-selection
      className={`mb-1.5 flex h-9 min-w-0 flex-none items-center gap-2 rounded-ui border px-2.5 transition-colors duration-150 ${
        hasSelection
          ? "border-rl-select-ring/40 bg-rl-select"
          : "border-transparent bg-transparent"
      }`}
      role="toolbar"
      aria-label="Selection"
    >
      {!hasSelection ? (
        <p className={`${HELPER_TEXT} truncate`}>{hint}</p>
      ) : (
        <>
          <p className="m-0 min-w-0 truncate text-[0.8125rem] font-semibold text-rl-navy" aria-live="polite">
            {isWholeRows
              ? `${countLabel(wholeRowCount, rowNoun)} selected (${wholeRowNumbers})`
              : `${countLabel(cellCount, "cell")} selected in ${countLabel(rowCount, rowNoun)}`}
          </p>

          <div className="ml-auto flex flex-none items-center gap-1.5">
            {onClearValues && (
              <button
                type="button"
                className={SMALL_BUTTON}
                disabled={!isEnabled}
                onClick={onClearValues}
                title={`Empty the selected cells (Delete). The ${rowNoun}s stay.`}
              >
                Clear values
              </button>
            )}
            {isWholeRows && onDeleteRows && (
              <button
                type="button"
                className={DANGER_SMALL_BUTTON}
                disabled={!isEnabled}
                onClick={onDeleteRows}
                title={`Delete the selected ${rowNoun}s (Delete)`}
              >
                <svg className="mr-1 size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3" />
                </svg>
                {wholeRowCount === 1 ? `Delete ${rowNoun}` : `Delete ${countLabel(wholeRowCount, rowNoun)}`}
              </button>
            )}
            <button
              type="button"
              className={`${ICON_BUTTON} size-7`}
              onClick={onDismiss}
              aria-label="Clear selection (Esc)"
              title="Clear selection (Esc)"
            >
              <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                <path d="m7 7 10 10M17 7 7 17" />
              </svg>
            </button>
          </div>
        </>
      )}
    </div>
  );
}

export default SelectionBar;
