import type {
  RawLithoRow as RawLithoRowRecord,
  RowField,
  LookupData,
  LookupStatuses,
  RowChange,
} from "../../types/domain";
import { useRef } from "react";
import LookupAutocomplete from "./LookupAutocomplete";
import {
  COMPACT_COLUMN_KEYS,
  REQUIRED_COLUMN_KEYS,
  tableColumns,
} from "./constants";
import { handleCellNavigation, isClearCellRequest } from "./tableNavigation";
import { rawLithoConfig } from "./config";
import { CELL_INPUT } from "./rawLithoStyles";
import { BODY_CELL, bodyRowClass } from "../../components/dataTableStyles";
import { RAW_LITHO_LOOKUP_BY_FIELD } from "../../services/rawLithoLookupConfig";
import { findConditionalRuleIssues, hasValue } from "./rawLithoValidation";

interface RawLithoRowProps {
  row: RawLithoRowRecord;
  rowIndex: number;
  lookupData: LookupData;
  lookupStatus: LookupStatuses;
  onRowChange: RowChange;
  onDepthCommit: RowChange;
  isEnabled: boolean;
  hasDuplicateInterval?: boolean;
  selectedColumns?: ReadonlySet<RowField>;
}






const DEPTH_FIELDS = new Set<RowField>(["lithoFrom", "lithoTo"]);



/*
 * One look per cell state, strongest first: the Ctrl + click selection stays
 * visible over the duplicate flag, which wins over a broken conditional rule
 * (red, message as tooltip), which wins over the missing-value flag. The
 * marker classes (`raw-litho-cell--*`) carry no styling; they name the state
 * for tests and for the README.
 */
const CELL_STATES = {
  selected:
    "raw-litho-cell--selected bg-[#dbeafe] shadow-[inset_0_0_0_2px_#2563eb]",
  duplicate:
    "raw-litho-cell--duplicate bg-[#fff3e6] shadow-[inset_0_0_0_2px_#d97a1f] focus-within:bg-[#fffaf4] focus-within:shadow-[inset_0_0_0_2px_var(--color-rl-cell-ring),inset_0_0_0_4px_rgb(217_122_31/45%)]",
  rule:
    "raw-litho-cell--rule bg-[#fdf4f3] shadow-[inset_0_0_0_2px_var(--color-rl-danger)] focus-within:bg-[#fffafa] focus-within:shadow-[inset_0_0_0_2px_var(--color-rl-cell-ring),inset_0_0_0_4px_rgb(192_57_47/32%)]",
  missing:
    "raw-litho-cell--missing bg-[#fdf4f3] shadow-[inset_0_0_0_2px_var(--color-rl-required-soft)] focus-within:bg-[#fffafa] focus-within:shadow-[inset_0_0_0_2px_var(--color-rl-cell-ring),inset_0_0_0_4px_rgb(192_57_47/32%)] [&_input]:placeholder:text-rl-required/75",
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
  hasDuplicateInterval = false,
  selectedColumns,
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
      <td className={BODY_CELL}>{rowIndex + 1}</td>

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
          hasDuplicateInterval && isEnabled && DEPTH_FIELDS.has(column.key);

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
            title={ruleMessage}
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
                isPageEnabled={isEnabled}
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

export default RawLithoRow;
