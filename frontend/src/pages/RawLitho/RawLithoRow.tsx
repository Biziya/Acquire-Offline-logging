import type {
  RawLithoRow as RawLithoRowRecord,
  RowField,
  LookupData,
  LookupStatuses,
  RowChange,
} from "../../types/domain";
import { memo, useRef } from "react";
import LookupAutocomplete from "./LookupAutocomplete";
import {
  COMPACT_COLUMN_KEYS,
  REQUIRED_COLUMN_KEYS,
  tableColumns,
} from "./constants";
import { handleCellNavigation, isClearCellRequest } from "./tableNavigation";
import { rawLithoConfig } from "./config";
import { CELL_INPUT } from "../../components/dataTableStyles";
import { BODY_CELL, bodyRowClass } from "../../components/dataTableStyles";
import { RAW_LITHO_LOOKUP_BY_FIELD } from "../../services/rawLithoLookupConfig";
import { findConditionalRuleIssues, hasValue } from "./rawLithoValidation";
import { DEPTH_FIELDS } from "../../types/rawLithoSchema";

interface RawLithoRowProps {
  row: RawLithoRowRecord;
  rowIndex: number;
  lookupData: LookupData;
  lookupStatus: LookupStatuses;
  onRowChange: RowChange;
  onDepthCommit: RowChange;
  isEnabled: boolean;
  hasOverlappingInterval?: boolean;
  selectedColumns?: ReadonlySet<RowField>;
  /*
   * Every cell of the row is selected (row number clicked, or a drag over the
   * numbers). The number cell then shows as a selected row header.
   */
  isRowSelected?: boolean;
}

const OVERLAP_MESSAGE = "This interval overlaps another row";

/* The row number cell: a hover tint, and a navy edge plus the selection colour when the whole row is selected. */
const ROW_HEADER_STATES = {
  normal: "text-rl-text-muted hover:bg-rl-navy-soft hover:text-rl-navy",
  selected:
    "raw-litho-row--selected bg-rl-select font-bold text-rl-navy shadow-[inset_3px_0_0_var(--color-rl-navy)]",
};

/*
 * One look per cell state, strongest first: the Ctrl + click selection stays
 * visible over the overlapping-interval flag, which wins over a broken conditional rule
 * (red, message as tooltip), which wins over the missing-value flag. The
 * marker classes (`raw-litho-cell--*`) carry no styling; they name the state
 * for tests and for the README.
 */
const CELL_STATES = {
  selected:
    "raw-litho-cell--selected bg-rl-select shadow-[inset_0_0_0_2px_var(--color-rl-select-ring)]",
  duplicate:
    "raw-litho-cell--duplicate bg-rl-duplicate shadow-[inset_0_0_0_2px_var(--color-rl-warning)] focus-within:bg-rl-duplicate focus-within:shadow-[inset_0_0_0_2px_var(--color-rl-cell-ring)]",
  rule:
    "raw-litho-cell--rule bg-rl-danger-soft shadow-[inset_0_0_0_2px_var(--color-rl-danger)] focus-within:bg-rl-danger-soft focus-within:shadow-[inset_0_0_0_2px_var(--color-rl-cell-ring)]",
  missing:
    "raw-litho-cell--missing bg-rl-danger-soft shadow-[inset_0_0_0_2px_var(--color-rl-required-soft)] focus-within:bg-rl-danger-soft focus-within:shadow-[inset_0_0_0_2px_var(--color-rl-cell-ring)] [&_input]:placeholder:text-rl-required/75",
  normal:
    "focus-within:bg-white focus-within:shadow-[inset_0_0_0_2px_var(--color-rl-cell-ring)]",
};

function buildCellClassName({
  isMissingValue,
  isDuplicateCell,
  breaksRule,
  isSelected,
}: {
  isMissingValue: boolean;
  isDuplicateCell: boolean;
  breaksRule: boolean;
  isSelected: boolean;
}) {
  const state = isSelected
    ? CELL_STATES.selected
    : isDuplicateCell
      ? CELL_STATES.duplicate
      : breaksRule
        ? CELL_STATES.rule
        : isMissingValue
          ? CELL_STATES.missing
          : CELL_STATES.normal;

  return `${BODY_CELL} focus-within:relative focus-within:z-[1] ${state}`;
}

function RawLithoRow({
  row,
  rowIndex,
  lookupData,
  lookupStatus,
  onRowChange,
  onDepthCommit,
  isEnabled,
  hasOverlappingInterval = false,
  selectedColumns,
  isRowSelected = false,
}: RawLithoRowProps) {
  const valueBeforeEdit = useRef<Partial<Record<RowField, string>>>({});
  // Conditional rules on this row's current values (rawLithoValidation.ts);
  // re-evaluated on every change of the row, however it was made.
  const ruleMessages = new Map<RowField, string>(
    isEnabled
      ? findConditionalRuleIssues(row).map((issue) => [issue.field, issue.message])
      : [],
  );

  /*
   * Tells the workspace a depth value has settled, which is what triggers the
   * reordering. Fired on blur and on Enter, never per keystroke.
   */
  function commitDepth(columnKey: RowField) {
    if (!DEPTH_FIELDS.has(columnKey)) return;

    onDepthCommit(row.id, columnKey, valueBeforeEdit.current[columnKey] ?? "");
  }

  return (
    <tr
      className={bodyRowClass(rowIndex)}
      style={{ height: rawLithoConfig.rowHeight }}
      data-row-id={row.id}
    >
      {/*
        Row header, like Excel's: the table's mousedown listener reads
        `data-row-number` for click, Shift + click, Ctrl + click and drag over
        the numbers, so the row needs no callback of its own. Kept out of Tab
        and arrow navigation (tabIndex -1): it is not a cell.
      */}
      <td
        className={`${BODY_CELL} select-none p-0 ${ROW_HEADER_STATES[isRowSelected ? "selected" : "normal"]}`}
        data-row-number
      >
        <button
          type="button"
          tabIndex={-1}
          data-row-select
          className="block size-full cursor-pointer border-0 bg-transparent p-0 text-center font-[inherit] text-inherit tabular-nums disabled:cursor-default"
          disabled={!isEnabled}
          aria-label={`Select row ${rowIndex + 1}`}
          aria-pressed={isRowSelected}
          title="Click to select this row. Shift + click selects a range, Ctrl + click adds a row."
        >
          {rowIndex + 1}
        </button>
      </td>

      {tableColumns.map((column) => {
        const lookup = RAW_LITHO_LOOKUP_BY_FIELD[column.key];
        const status = lookupStatus[column.key] ?? {
          isLoading: false,
          error: "",
        };
        const isCompact = COMPACT_COLUMN_KEYS.has(column.key);
        const isRequired = REQUIRED_COLUMN_KEYS.has(column.key);
        const isMissingValue =
          isRequired && isEnabled && !hasValue(row[column.key]);
        const ruleMessage = ruleMessages.get(column.key);
        const isDuplicateCell =
          hasOverlappingInterval && isEnabled && DEPTH_FIELDS.has(column.key);

        const cellClassName = buildCellClassName({
          isMissingValue,
          isDuplicateCell,
          breaksRule: ruleMessage !== undefined,
          isSelected: selectedColumns?.has(column.key) ?? false,
        });

        return (
          <td
            key={column.key}
            className={cellClassName}
            data-column={column.key}
            title={isDuplicateCell ? OVERLAP_MESSAGE : ruleMessage}
            data-rule-error={ruleMessage}
          >
            {lookup ? (
              <LookupAutocomplete
                rowIndex={rowIndex}
                lookup={lookup}
                records={lookup.options ?? lookupData[column.key] ?? []}
                value={row[column.key] ?? ""}
                onValueChange={(value) =>
                  onRowChange(row.id, column.key, value)
                }
                isEnabled={isEnabled}
                isLoading={lookup.source === "local" ? false : status.isLoading}
                error={lookup.source === "local" ? "" : status.error}
                isCompact={isCompact}
                isRequired={isRequired}
              />
            ) : (
              <input
                className={`${CELL_INPUT} ${isCompact ? "px-0.5" : "px-1"}`}
                type={column.type}
                disabled={!isEnabled}
                step={column.type === "number" ? "any" : undefined}
                min={
                  column.key === "lithoTo" && row.lithoFrom !== ""
                    ? row.lithoFrom
                    : undefined
                }
                max={
                  column.key === "lithoFrom" && row.lithoTo !== ""
                    ? row.lithoTo
                    : undefined
                }
                value={row[column.key]}
                required={isRequired}
                aria-invalid={isDuplicateCell || undefined}
                aria-label={`${column.label}, row ${rowIndex + 1}`}
                onFocus={() => {
                  if (DEPTH_FIELDS.has(column.key)) {
                    valueBeforeEdit.current[column.key] = row[column.key];
                  }
                }}
                onKeyDown={(event) => {
                  if (isClearCellRequest(event)) {
                    event.preventDefault();
                    onRowChange(row.id, column.key, "");
                    return;
                  }

                  if (event.key === "Enter") {
                    event.preventDefault();
                    commitDepth(column.key);
                    return;
                  }

                  handleCellNavigation(event);
                }}
                onChange={(event) =>
                  onRowChange(row.id, column.key, event.target.value)
                }
                onBlur={() => commitDepth(column.key)}
              />
            )}
          </td>
        );
      })}
    </tr>
  );
}

// Memoized: with stable callbacks from the workspace, a keystroke re-renders
// only the edited row (unchanged rows keep their object identity).
export default memo(RawLithoRow);
