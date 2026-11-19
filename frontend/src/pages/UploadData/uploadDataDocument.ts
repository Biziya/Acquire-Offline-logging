import type { RowField } from "../../types/domain";
import { isRecord } from "../../types/validation";
import { DEPTH_FIELDS } from "../../types/rawLithoSchema";
import { isValidDepth } from "../RawLitho/rawLithoValidation";

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
 * depth, so an edit does not change the value's type. So does one that was
 * missing or not yet a depth (emptied, or "-" half typed): clearing a cell
 * and typing "12" stores 12, not "12". A depth that was valid text stays
 * text. Anything else is stored as typed (validation reports it).
 * "5." is stored as 5; the table keeps showing the typed "5." until the cell
 * loses focus (UploadDataTable's shownDepthText).
 */
function storedValue(previous: unknown, field: RowField, text: string) {
  if (
    DEPTH_FIELDS.has(field) &&
    isValidDepth(text) &&
    (typeof previous === "number" || !isValidDepth(previous))
  ) {
    return Number(text.trim());
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

/* The document without the records at `rowIndexes`; unchanged when none exist. */
export function removeDocumentRows(
  document: UploadDocument,
  rowIndexes: readonly number[],
): UploadDocument {
  const rows = getDocumentRows(document);
  const removed = new Set(rowIndexes.filter((index) => index >= 0 && index < rows.length));
  if (removed.size === 0) return document;

  return { ...document, rows: rows.filter((_, index) => !removed.has(index)) };
}

/* The JSON uploaded for an edited document; same layout as a Raw Litho export. */
export function serializeDocument(document: UploadDocument) {
  return JSON.stringify(document, null, 2);
}
