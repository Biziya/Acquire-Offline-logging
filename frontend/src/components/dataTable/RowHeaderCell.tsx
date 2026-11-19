import { BODY_CELL } from "../dataTableStyles";

/* A hover tint, and a navy edge plus the selection colour when the whole row is selected. */
const ROW_HEADER_STATES = {
  normal: "text-rl-text-muted hover:bg-rl-navy-soft hover:text-rl-navy",
  selected:
    "table-row--selected bg-rl-select font-bold text-rl-navy shadow-[inset_3px_0_0_var(--color-rl-navy)]",
};

/*
 * The row header, like Excel's. `useTableSelection` reads `data-row-number`
 * for click, Shift + click, Ctrl + click and drag over the numbers, so the
 * cell needs no callback of its own. Kept out of Tab and arrow navigation
 * (tabIndex -1): it is not a data cell.
 */
function RowHeaderCell({
  number,
  isSelected,
  isEnabled,
  rowNoun = "row",
}: {
  /* 1-based number shown in the cell. */
  number: number;
  isSelected: boolean;
  isEnabled: boolean;
  rowNoun?: string;
}) {
  return (
    <td
      className={`${BODY_CELL} select-none p-0 ${ROW_HEADER_STATES[isSelected ? "selected" : "normal"]}`}
      data-row-number
    >
      <button
        type="button"
        tabIndex={-1}
        data-row-select
        className="block size-full cursor-pointer border-0 bg-transparent p-0 text-center font-[inherit] text-inherit tabular-nums disabled:cursor-default"
        disabled={!isEnabled}
        aria-label={`Select ${rowNoun} ${number}`}
        aria-pressed={isSelected}
        title={`Click to select this ${rowNoun}. Shift + click selects a range, Ctrl + click adds a ${rowNoun}.`}
      >
        {number}
      </button>
    </td>
  );
}

/*
 * The "No." header cell: like Excel's corner cell, selects every row.
 */
export function SelectAllHeaderCell({
  className,
  width,
  isEnabled,
  onSelectAll,
  rowNoun = "row",
}: {
  className: string;
  width: string | number;
  isEnabled: boolean;
  onSelectAll: () => void;
  rowNoun?: string;
}) {
  return (
    <th className={`${className} p-0`} style={{ width }}>
      <button
        type="button"
        tabIndex={-1}
        data-keep-selection
        className="block size-full cursor-pointer border-0 bg-transparent px-1 font-[inherit] text-inherit hover:bg-rl-navy-soft disabled:cursor-default disabled:hover:bg-transparent"
        disabled={!isEnabled}
        onClick={onSelectAll}
        title={`${rowNoun[0]?.toUpperCase()}${rowNoun.slice(1)} number. Click to select all ${rowNoun}s; click a number to select that ${rowNoun}.`}
        aria-label={`Select all ${rowNoun}s`}
      >
        No.
      </button>
    </th>
  );
}

export default RowHeaderCell;
