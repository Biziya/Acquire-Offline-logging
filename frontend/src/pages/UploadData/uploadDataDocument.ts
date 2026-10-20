import type { RowField } from "../../types/domain";
import { isRecord } from "../../types/validation";

/*
 * The working copy of an imported JSON document.
 *
 * The parsed file is the one authoritative document: the preview table reads
 * from it and every edit produces the next version of it. Only the rows that
 * change are copied; untouched rows keep their object identity, and every key
 * of the document and of each row — known, hidden or extra — is kept exactly.
 * The selected File is never modified.
 */
export type UploadDocument = Record<string, unknown>;

export interface CellEdit {
  rowIndex: number;
  field: RowField;
  text: string;
}

const DEPTH_FIELDS = new Set<RowField>(["lithoFrom", "lithoTo"]);

export function getDocumentRows(document: UploadDocument): readonly unknown[] {
  return Array.isArray(document.rows) ? document.rows : [];
}

/* Primitive values can be edited; objects and arrays are shown as JSON only. */
export function isEditableValue(value: unknown) {
  return value === null || value === undefined || typeof value !== "object";
}

export function cellText(row: unknown, field: RowField): string {
  if (!isRecord(row)) return "";
  const value = row[field];
  if (value === null || value === undefined) return "";
  return typeof value === "object" ? JSON.stringify(value) : String(value);
}

/*
 * A depth that was a JSON number stays a number when the new text is a
 * number, so an edit does not change the value's type. Anything else is
 * stored as typed text (and validation reports it if it is not acceptable).
 */
function storedValue(previous: unknown, field: RowField, text: string) {
  if (
    DEPTH_FIELDS.has(field) &&
    typeof previous === "number" &&
    text.trim() !== "" &&
    Number.isFinite(Number(text))
  ) {
    return Number(text);
  }
  return text;
}

export function applyCellEdits(
  document: UploadDocument,
  edits: readonly CellEdit[],
): UploadDocument {
  const rows = getDocumentRows(document);
  let nextRows: unknown[] | null = null;

  for (const { rowIndex, field, text } of edits) {
    const row = (nextRows ?? rows)[rowIndex];
    if (!isRecord(row) || !isEditableValue(row[field])) continue;
    if (cellText(row, field) === text) continue;

    nextRows ??= [...rows];
    nextRows[rowIndex] = { ...row, [field]: storedValue(row[field], field, text) };
  }

  return nextRows ? { ...document, rows: nextRows } : document;
}

/* The JSON uploaded for an edited document; same layout as a Raw Litho export. */
export function serializeDocument(document: UploadDocument) {
  return JSON.stringify(document, null, 2);
}
