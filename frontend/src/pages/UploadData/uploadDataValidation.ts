import type { LookupData, RowField } from "../../types/domain";
import { isRecord } from "../../types/validation";
import { columnByKey, columns } from "../../types/rawLithoSchema";
import {
  RAW_LITHO_ALL_LOOKUPS,
  RAW_LITHO_LOOKUPS,
} from "../../services/rawLithoLookupConfig";
import { REQUIRED_COLUMN_KEY_LIST } from "../RawLitho/constants";
import {
  isValidDepth,
  normalizeLookupCode,
} from "../RawLitho/rawLithoValidation";
import { getDocumentRows, type UploadDocument } from "./uploadDataDocument";

/*
 * Checks an imported (and possibly edited) document before upload. No new
 * business rules are invented here; every check comes from one of two places:
 *
 *   error    — the backend contract (POST /api/uploaddata rejects it: missing
 *              project / drillhole / rows, a null row, an empty or non-numeric
 *              depth, a non-text value in a text field, a non-integer id or
 *              timestamp it cannot parse), or a Raw Litho rule the Raw Litho
 *              page also refuses (inverted range, duplicate interval, unknown
 *              lookup code — Raw Litho's Save is blocked by it).
 *   warning  — what Raw Litho tolerates in a saved export: a required field
 *              left empty, a missing campaign or timestamp, lookup codes that
 *              could not be checked because the lookup data is unavailable.
 *
 * Errors block the upload; warnings do not. Pure: no React, no DOM.
 */

export type IssueSeverity = "error" | "warning";
export type RowStatus = "valid" | "warning" | "error";

export interface UploadIssue {
  severity: IssueSeverity;
  message: string;
  field?: RowField;
}

export type LookupState = "loading" | "ready" | "unavailable";

export interface UploadLookups {
  records: LookupData;
  state: Partial<Record<RowField, LookupState>>;
}

export interface UploadValidation {
  documentIssues: UploadIssue[];
  /* Index-aligned with the rows; undefined for a row with no issues. */
  rowIssues: (UploadIssue[] | undefined)[];
  rowStatus: RowStatus[];
  counts: { total: number; valid: number; warning: number; error: number };
  hasBlockingErrors: boolean;
}

const DEPTH_FIELDS: readonly RowField[] = ["lithoFrom", "lithoTo"];
const TEXT_FIELDS = columns
  .map(({ key }) => key)
  .filter((key) => !DEPTH_FIELDS.includes(key));

function label(field: RowField) {
  return columnByKey[field].label;
}

function isBlank(value: unknown) {
  return value === null || value === undefined || String(value).trim() === "";
}

/* Codes accepted per lookup field; null when the codes cannot be checked. */
function buildLookupCodes(lookups: UploadLookups) {
  const codes = new Map<RowField, Set<string> | null>();

  RAW_LITHO_ALL_LOOKUPS.forEach((lookup) => {
    const records =
      lookup.options ??
      (lookups.state[lookup.fieldKey] === "ready"
        ? lookups.records[lookup.fieldKey]
        : undefined);

    codes.set(
      lookup.fieldKey,
      records && records.length > 0
        ? new Set(
            records.map((record) =>
              normalizeLookupCode(record[lookup.codeProperty]),
            ),
          )
        : null,
    );
  });

  return codes;
}

function validateMetadata(document: UploadDocument): UploadIssue[] {
  const issues: UploadIssue[] = [];

  for (const [key, name] of [
    ["project", "Project"],
    ["drillhole", "Drillhole"],
  ] as const) {
    if (typeof document[key] !== "string" || isBlank(document[key])) {
      issues.push({ severity: "error", message: `${name} is required.` });
    }
  }

  if (document.campaign === undefined || isBlank(document.campaign)) {
    issues.push({ severity: "warning", message: "Campaign is missing." });
  } else if (typeof document.campaign !== "string") {
    issues.push({ severity: "error", message: "Campaign must be text." });
  }

  // Optional creator and last editor (Raw Litho `created_by` / `edited_by`);
  // older files have neither.
  for (const key of ["created_by", "edited_by"] as const) {
    const value = document[key];
    if (value !== undefined && value !== null && typeof value !== "string") {
      issues.push({ severity: "warning", message: `${key} is not text.` });
    }
  }

  for (const key of ["created_at", "modified_at"] as const) {
    const value = document[key];
    if (value === undefined || value === null || value === "") {
      issues.push({ severity: "warning", message: `${key} is missing.` });
    } else if (typeof value !== "string" || Number.isNaN(Date.parse(value))) {
      issues.push({
        severity: "error",
        message: `${key} is not a valid date and time.`,
      });
    }
  }

  if (!Array.isArray(document.rows)) {
    issues.push({ severity: "error", message: "rows must be a list of records." });
  } else if (document.rows.length === 0) {
    issues.push({
      severity: "error",
      message: "rows is empty; at least one record is required.",
    });
  }

  return issues;
}

function isWholeNumberId(value: unknown) {
  if (value === null || value === undefined) return true;
  if (typeof value === "number") return Number.isInteger(value);
  return typeof value === "string" && /^-?\d+$/.test(value.trim());
}

function validateRow(
  row: unknown,
  lookupCodes: Map<RowField, Set<string> | null>,
): UploadIssue[] {
  if (!isRecord(row)) {
    return [{ severity: "error", message: "The record is not an object." }];
  }

  const issues: UploadIssue[] = [];

  if (!isWholeNumberId(row.id)) {
    issues.push({ severity: "error", message: "id must be a whole number." });
  }

  DEPTH_FIELDS.forEach((field) => {
    const value = row[field];
    if (value === null || value === undefined) return;
    if (value === "" || (typeof value === "string" && !value.trim())) {
      issues.push({ severity: "error", field, message: `${label(field)} is empty.` });
    } else if (!isValidDepth(value)) {
      issues.push({ severity: "error", field, message: `${label(field)} must be a number.` });
    }
  });

  TEXT_FIELDS.forEach((field) => {
    const value = row[field];
    if (value !== null && value !== undefined && typeof value !== "string") {
      issues.push({ severity: "error", field, message: `${label(field)} must be text.` });
    }
  });

  if (
    isValidDepth(row.lithoFrom) &&
    isValidDepth(row.lithoTo) &&
    Number(row.lithoFrom) > Number(row.lithoTo)
  ) {
    issues.push({
      severity: "error",
      field: "lithoTo",
      message: "Litho From is greater than Litho To.",
    });
  }

  lookupCodes.forEach((codes, field) => {
    const value = row[field];
    if (!codes || typeof value !== "string" || !value.trim()) return;
    if (!codes.has(normalizeLookupCode(value))) {
      issues.push({
        severity: "error",
        field,
        message: `${label(field)} "${value}" is not a known code.`,
      });
    }
  });

  REQUIRED_COLUMN_KEY_LIST.forEach((field) => {
    const value = row[field];
    // A depth holding empty text is already reported as an error above.
    const isEmptyDepthText =
      DEPTH_FIELDS.includes(field) && typeof value === "string";
    if (isBlank(value) && !isEmptyDepthText) {
      issues.push({ severity: "warning", field, message: `${label(field)} is required.` });
    }
  });

  return issues;
}

/* Rows sharing the same numeric Litho From / Litho To pair (Raw Litho rule). */
function findDuplicateIntervals(rows: readonly unknown[]) {
  const indicesByInterval = new Map<string, number[]>();

  rows.forEach((row, index) => {
    if (!isRecord(row)) return;
    if (!isValidDepth(row.lithoFrom) || !isValidDepth(row.lithoTo)) return;

    const key = `${Number(row.lithoFrom)}|${Number(row.lithoTo)}`;
    const indices = indicesByInterval.get(key) ?? [];
    indices.push(index);
    indicesByInterval.set(key, indices);
  });

  return Array.from(indicesByInterval.values()).filter(
    (indices) => indices.length > 1,
  );
}

export function validateUploadDocument(
  document: UploadDocument,
  lookups: UploadLookups,
): UploadValidation {
  const documentIssues = validateMetadata(document);
  const rows = getDocumentRows(document);
  const lookupCodes = buildLookupCodes(lookups);

  const unchecked = RAW_LITHO_LOOKUPS.filter(
    (lookup) => lookupCodes.get(lookup.fieldKey) === null,
  );
  if (unchecked.length > 0) {
    const loading = unchecked.some(
      (lookup) => lookups.state[lookup.fieldKey] === "loading",
    );
    documentIssues.push({
      severity: "warning",
      message: loading
        ? "Lookup codes loading; not checked yet."
        : "Lookup codes not checked.",
    });
  }

  const rowIssues: (UploadIssue[] | undefined)[] = rows.map((row) => {
    const issues = validateRow(row, lookupCodes);
    return issues.length > 0 ? issues : undefined;
  });

  findDuplicateIntervals(rows).forEach((indices) => {
    indices.forEach((index) => {
      const issue: UploadIssue = {
        severity: "error",
        field: "lithoFrom",
        message: `Duplicate interval: also in record ${indices
          .filter((other) => other !== index)
          .map((other) => other + 1)
          .join(", ")}.`,
      };
      rowIssues[index] = [...(rowIssues[index] ?? []), issue, { ...issue, field: "lithoTo" }];
    });
  });

  const counts = { total: rows.length, valid: 0, warning: 0, error: 0 };
  const rowStatus = rowIssues.map((issues): RowStatus => {
    const status: RowStatus = !issues
      ? "valid"
      : issues.some((issue) => issue.severity === "error")
        ? "error"
        : "warning";
    counts[status] += 1;
    return status;
  });

  return {
    documentIssues,
    rowIssues,
    rowStatus,
    counts,
    hasBlockingErrors:
      counts.error > 0 ||
      documentIssues.some((issue) => issue.severity === "error"),
  };
}
