import type {
  RawLithoRow,
  RowField,
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
  overlappingInterval: "overlappingInterval",
});

/*
 * Whether a field holds a meaningful value — the one definition of "empty"
 * for every rule. "0" and 0 are values; null, undefined and whitespace-only
 * text are empty.
 */
export function hasValue(value: unknown): boolean {
  return value !== null && value !== undefined && String(value).trim() !== "";
}

/* Required keys of `row` that are still empty, in table column order. */
export function getMissingRequiredFields(row: RawLithoRow | undefined) {
  if (!row) return [...REQUIRED_COLUMN_KEY_LIST];

  return REQUIRED_COLUMN_KEY_LIST.filter((fieldKey) => !hasValue(row[fieldKey]));
}

/*
 * ---------------------------------------------------------------------------
 * Conditional field rules
 *
 * Which attribute a row needs, or must leave empty, depending on its Litho and
 * Redox codes. Codes are matched exactly (case-sensitive, surrounding spaces
 * ignored). Checked on the final row values, so typing, choosing from a list,
 * inserting, single and multi-cell paste and import all get the same result —
 * a paste that sets Redox and OX together is judged on the combination.
 * Nothing is ever changed or cleared automatically.
 * ---------------------------------------------------------------------------
 */

export const CONDITIONAL_RULE_CODES = Object.freeze({
  /* Rule 1: OM Facies is required when OM has a value or Litho is one of these. */
  omFaciesLithoCodes: ["01M", "24M", "46M", "0-L", "26L", "L--"],
  /* Rule 2: CA is required when Litho is one of these. */
  caLithoCodes: ["0-C", "26C", "CA-"],
  /* Rule 3: OX is required when Redox is one of these. */
  oxRequiredRedoxCodes: ["O", "Y", "lY", "lGrB", "GnRd", "BrGn"],
  /* Rule 4: OX must be empty when Redox is one of these. */
  oxEmptyRedoxCodes: ["Bl", "dGn", "Gr", "WGr", "GrGn", "GnGr"],
} as const);

export const CONDITIONAL_RULE_MESSAGES = Object.freeze({
  omFaciesRequired: "OM Facies is required for the selected OM or Litho value.",
  caRequired: "CA is required for this Litho code.",
  oxRequired: "OX is required for this Redox code.",
  oxMustBeEmpty: "OX must be empty for this Redox code.",
});

export interface ConditionalRuleIssue {
  /* The cell to mark: the one that must be filled in or emptied. */
  field: "omFacies" | "ca" | "ox";
  message: string;
}

function codeOf(value: unknown) {
  return hasValue(value) ? String(value).trim() : "";
}

function isOneOf(value: unknown, codes: readonly string[]) {
  return codes.includes(codeOf(value));
}

/* Every conditional rule `row` breaks; empty when it breaks none. Pure. */
export function findConditionalRuleIssues(
  row: Partial<Record<RowField, unknown>>,
): ConditionalRuleIssue[] {
  const issues: ConditionalRuleIssue[] = [];
  const codes = CONDITIONAL_RULE_CODES;

  if (
    (hasValue(row.om) || isOneOf(row.lithoCode, codes.omFaciesLithoCodes)) &&
    !hasValue(row.omFacies)
  ) {
    issues.push({ field: "omFacies", message: CONDITIONAL_RULE_MESSAGES.omFaciesRequired });
  }

  if (isOneOf(row.lithoCode, codes.caLithoCodes) && !hasValue(row.ca)) {
    issues.push({ field: "ca", message: CONDITIONAL_RULE_MESSAGES.caRequired });
  }

  if (isOneOf(row.redoxCode, codes.oxRequiredRedoxCodes) && !hasValue(row.ox)) {
    issues.push({ field: "ox", message: CONDITIONAL_RULE_MESSAGES.oxRequired });
  }

  if (isOneOf(row.redoxCode, codes.oxEmptyRedoxCodes) && hasValue(row.ox)) {
    issues.push({ field: "ox", message: CONDITIONAL_RULE_MESSAGES.oxMustBeEmpty });
  }

  return issues;
}

/* The first broken rule in `rows` (table order), for a blocking warning. */
export function findFirstConditionalRuleIssue(rows: readonly RawLithoRow[]) {
  for (const [rowIndex, row] of rows.entries()) {
    const [issue] = findConditionalRuleIssues(row);
    if (issue) return { rowIndex, ...issue };
  }

  return null;
}

/*
 * Numeric Litho From / Litho To of a row, or null while the interval is
 * incomplete or inverted, which means partially typed rows are never reported
 * as overlapping. Numbers are compared by value, so "120" equals "120.0".
 */
function toInterval(row: RawLithoRow | undefined) {
  if (!isValidDepth(row?.lithoFrom)) return null;
  if (!isValidDepth(row?.lithoTo)) return null;

  const from = Number(row?.lithoFrom);
  const to = Number(row?.lithoTo);

  return from <= to ? { from, to } : null;
}

/*
 * Two intervals intersect when they share more than an end point: 0–10 and
 * 5–12 overlap, 0–10 and 10–20 only touch and are fine. Identical intervals
 * (including zero-length ones such as 5–5 twice) always count as overlapping.
 */
function intervalsOverlap(
  first: { from: number; to: number },
  second: { from: number; to: number },
) {
  if (first.from === second.from && first.to === second.to) return true;

  return first.from < second.to && second.from < first.to;
}

export function overlapsAnotherInterval(
  currentRow: RawLithoRow | undefined,
  rows: RawLithoRow[],
) {
  const interval = toInterval(currentRow);
  if (!interval) return false;

  return rows.some((row) => {
    if (row.id === currentRow?.id) return false;
    const other = toInterval(row);
    return other !== null && intervalsOverlap(interval, other);
  });
}

/* Ids of every row whose interval intersects another row's interval. */
export function findOverlappingIntervalRowIds(rows: RawLithoRow[]) {
  const intervals = rows
    .map((row) => ({ id: row.id, interval: toInterval(row) }))
    .filter(
      (entry): entry is { id: RowId; interval: { from: number; to: number } } =>
        entry.interval !== null,
    )
    .sort((first, second) => first.interval.from - second.interval.from);

  const overlappingRowIds = new Set<RowId>();

  // Sorted by From, so the scan can stop once a later row starts past this
  // row's To: no row after it can intersect this one.
  intervals.forEach((entry, index) => {
    for (let next = index + 1; next < intervals.length; next += 1) {
      const other = intervals[next];
      if (!other || other.interval.from > entry.interval.to) break;

      if (intervalsOverlap(entry.interval, other.interval)) {
        overlappingRowIds.add(entry.id);
        overlappingRowIds.add(other.id);
      }
    }
  });

  return overlappingRowIds;
}

/* The first row (table order) that overlaps another, for a blocking warning. */
export function findFirstOverlappingRowIndex(rows: readonly RawLithoRow[]) {
  const overlapping = findOverlappingIntervalRowIds([...rows]);
  if (overlapping.size === 0) return -1;

  return rows.findIndex((row) => overlapping.has(row.id));
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

  if (overlapsAnotherInterval(row, rows)) {
    return {
      issue: ROW_VALIDATION_ISSUES.overlappingInterval,
      fieldKey: "lithoTo",
    };
  }

  return null;
}
