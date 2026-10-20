import type {
  RawLithoRow,
  RowId,
  RowIssue,
  LookupDefinition,
  LookupData,
} from "../../types/domain";
import { RAW_LITHO_ALL_LOOKUPS } from "../../services/rawLithoLookupConfig";
import { REQUIRED_COLUMN_KEY_LIST } from "./constants";

export function isValidDepth(value: unknown) {
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value !== "string") return false;

  return value.trim() !== "" && Number.isFinite(Number(value));
}

export function isValidDepthRange(row: RawLithoRow | undefined) {
  if (!isValidDepth(row?.lithoFrom)) return false;
  if (!isValidDepth(row?.lithoTo)) return false;

  return Number(row?.lithoFrom) <= Number(row?.lithoTo);
}

/*
 * Both depths are present and numeric but the wrong way round. Distinct from
 * `!isValidDepthRange`, which is also true for a half-filled row that the user
 * is still working on.
 */
export function isInvertedDepthRange(row: RawLithoRow | undefined) {
  if (!isValidDepth(row?.lithoFrom)) return false;
  if (!isValidDepth(row?.lithoTo)) return false;

  return Number(row?.lithoFrom) > Number(row?.lithoTo);
}

export function normalizeLookupCode(value: unknown) {
  if (value === null || value === undefined) return "";

  return String(value).trim().toLocaleLowerCase();
}

function isUnknownLookupValue(
  row: RawLithoRow,
  lookup: LookupDefinition,
  lookupData: LookupData,
  skipUnavailable: boolean,
) {
  const value = normalizeLookupCode(row[lookup.fieldKey]);
  if (!value) return false;

  const records = lookup.options ?? lookupData[lookup.fieldKey] ?? [];
  if (skipUnavailable && records.length === 0) return false;

  return !records.some(
    (record) => normalizeLookupCode(record?.[lookup.codeProperty]) === value,
  );
}

export function hasInvalidLookupValues(
  rows: RawLithoRow[],
  lookupData: LookupData,
  { skipUnavailable = false } = {},
) {
  return rows.some((row) =>
    RAW_LITHO_ALL_LOOKUPS.some((lookup) =>
      isUnknownLookupValue(row, lookup, lookupData, skipUnavailable),
    ),
  );
}

/*
 * ---------------------------------------------------------------------------
 * Row-level validation
 *
 * Everything below is pure: it takes rows and returns facts about them. The
 * mapping from an issue to a toast message lives in the workspace hook so the
 * warning wording can change without touching these rules.
 * ---------------------------------------------------------------------------
 */

export const ROW_VALIDATION_ISSUES = Object.freeze({
  missingRequiredFields: "missingRequiredFields",
  invalidDepthRange: "invalidDepthRange",
  duplicateInterval: "duplicateInterval",
});

function isEmptyValue(value: unknown) {
  return value === null || value === undefined || String(value).trim() === "";
}

/* Required keys of `row` that are still empty, in table column order. */
export function getMissingRequiredFields(row: RawLithoRow | undefined) {
  if (!row) return [...REQUIRED_COLUMN_KEY_LIST];

  return REQUIRED_COLUMN_KEY_LIST.filter((fieldKey) =>
    isEmptyValue(row[fieldKey]),
  );
}

export function validateRequiredFields(row: RawLithoRow | undefined) {
  const missingFields = getMissingRequiredFields(row);

  return { isValid: missingFields.length === 0, missingFields };
}

/*
 * Comparable key for a Litho From / Litho To pair. Numbers are compared by
 * value, so "120" and "120.0" count as the same interval. Returns null while
 * the interval is incomplete, which means partially typed rows are never
 * reported as duplicates.
 */
function buildIntervalKey(row: RawLithoRow | undefined) {
  if (!isValidDepth(row?.lithoFrom)) return null;
  if (!isValidDepth(row?.lithoTo)) return null;

  return `${Number(row?.lithoFrom)}|${Number(row?.lithoTo)}`;
}

export function isDuplicateInterval(
  currentRow: RawLithoRow | undefined,
  rows: RawLithoRow[],
) {
  const intervalKey = buildIntervalKey(currentRow);
  if (!intervalKey) return false;

  return rows.some(
    (row) => row.id !== currentRow?.id && buildIntervalKey(row) === intervalKey,
  );
}

/* Ids of every row that shares its interval with another row. */
export function findDuplicateIntervalRowIds(rows: RawLithoRow[]) {
  const rowIdsByInterval = new Map<string, RowId[]>();

  rows.forEach((row) => {
    const intervalKey = buildIntervalKey(row);
    if (!intervalKey) return;

    const rowIds = rowIdsByInterval.get(intervalKey) ?? [];

    rowIds.push(row.id);
    rowIdsByInterval.set(intervalKey, rowIds);
  });

  const duplicateRowIds = new Set<RowId>();

  rowIdsByInterval.forEach((rowIds) => {
    if (rowIds.length < 2) return;

    rowIds.forEach((rowId) => duplicateRowIds.add(rowId));
  });

  return duplicateRowIds;
}

/*
 * First reason `row` cannot be accepted, or null when the row is valid.
 * `fieldKey` is the cell that should receive focus while the issue lasts.
 */
export function findRowIssue(
  row: RawLithoRow | undefined,
  rows: RawLithoRow[],
): RowIssue | null {
  const missingFields = getMissingRequiredFields(row);

  const firstMissingField = missingFields[0];
  if (firstMissingField !== undefined) {
    return {
      issue: ROW_VALIDATION_ISSUES.missingRequiredFields,
      fieldKey: firstMissingField,
    };
  }

  if (!isValidDepthRange(row)) {
    return {
      issue: ROW_VALIDATION_ISSUES.invalidDepthRange,
      fieldKey: "lithoTo",
    };
  }

  if (isDuplicateInterval(row, rows)) {
    return {
      issue: ROW_VALIDATION_ISSUES.duplicateInterval,
      fieldKey: "lithoTo",
    };
  }

  return null;
}

export function isRowValid(row: RawLithoRow | undefined, rows: RawLithoRow[]) {
  return findRowIssue(row, rows) === null;
}
