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
import { RAW_LITHO_LOOKUP_BY_FIELD } from "../../services/rawLithoLookupConfig";

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

function isEmptyValue(value: unknown) {
  return value === null || value === undefined || String(value).trim() === "";
}

function buildCellClassName({
  columnKey,
  isCompact,
  isRequired,
  isMissingValue,
  isDuplicateCell,
  isSelected,
}: {
  columnKey: RowField;
  isCompact: boolean;
  isRequired: boolean;
  isMissingValue: boolean;
  isDuplicateCell: boolean;
  isSelected: boolean;
}) {
  return [
    "raw-litho-col",
    `raw-litho-col--${columnKey}`,
    isCompact ? "raw-litho-col--compact" : "",
    isRequired ? "raw-litho-cell--required" : "",
    isMissingValue ? "raw-litho-cell--missing" : "",
    isDuplicateCell ? "raw-litho-cell--duplicate" : "",
    isSelected ? "raw-litho-cell--selected" : "",
  ]
    .filter(Boolean)
    .join(" ");
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
  const isEvenRow = rowIndex % 2 === 1;

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
      className={isEvenRow ? "raw-litho-row--even" : "raw-litho-row--odd"}
      data-row-id={row.id}
    >
      <td className="raw-litho-col raw-litho-col--index">{rowIndex + 1}</td>

      {tableColumns.map((column) => {
        const lookup = RAW_LITHO_LOOKUP_BY_FIELD[column.key];
        const status = lookupStatus[column.key] ?? {
          isLoading: false,
          error: "",
        };
        const isCompact = COMPACT_COLUMN_KEYS.has(column.key);
        const isRequired = REQUIRED_COLUMN_KEYS.has(column.key);
        const isMissingValue =
          isRequired && isEnabled && isEmptyValue(row[column.key]);
        const isDuplicateCell =
          hasDuplicateInterval && isEnabled && DEPTH_FIELDS.has(column.key);

        const cellClassName = buildCellClassName({
          columnKey: column.key,
          isCompact,
          isRequired,
          isMissingValue,
          isDuplicateCell,
          isSelected: selectedColumns?.has(column.key) ?? false,
        });

        return (
          <td
            key={column.key}
            className={cellClassName}
            data-column={column.key}
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
                className={`raw-litho-input${
                  isCompact ? " raw-litho-input--compact" : ""
                }`}
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
