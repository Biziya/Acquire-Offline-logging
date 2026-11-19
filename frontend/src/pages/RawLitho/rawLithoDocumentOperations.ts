import type {
  AddRowResult,
  DocumentFallback,
  RawLithoDocument,
  RawLithoRow,
  RowIssue,
  RowIssueKind,
  RowField,
  RowId,
} from "../../types/domain";
import { createRowFromPrevious } from "./constants";
import { createSchemaRow } from "../../types/rawLithoSchema";
import {
  createRawLithoDocument,
  getNextRowId,
  normalizeFieldValue,
  touchRawLithoDocument,
} from "./rawLithoHelpers";
import {
  findRowIssue,
  getMissingRequiredFields,
  overlapsAnotherInterval,
  isInvertedDepthRange,
} from "./rawLithoValidation";
import { sortRowsByLithoFrom } from "./rawLithoSorting";
import type { CellEdit, CellRef } from "./rawLithoClipboard";

export function createBlankDocument(
  fallback: DocumentFallback = {},
): RawLithoDocument {
  return createRawLithoDocument({ ...fallback, rows: [createSchemaRow(1)] });
}

export function editRow(
  lithoDocument: RawLithoDocument,
  rowId: RowId,
  field: RowField,
  value: string,
): RawLithoDocument {
  value = normalizeFieldValue(field, value);
  if (!lithoDocument.rows.some((row) => row.id === rowId && row[field] !== value))
    return lithoDocument;
  return touchRawLithoDocument(lithoDocument, {
    rows: lithoDocument.rows.map((row) =>
      row.id === rowId ? { ...row, [field]: value } : row,
    ),
  });
}

export function sortDocument(lithoDocument: RawLithoDocument): RawLithoDocument {
  const rows = sortRowsByLithoFrom(lithoDocument.rows);
  return rows === lithoDocument.rows
    ? lithoDocument
    : touchRawLithoDocument(lithoDocument, { rows });
}

export function commitDepth(
  lithoDocument: RawLithoDocument,
  rowId: RowId,
  field: RowField,
  previousValue: string,
) {
  const row = lithoDocument.rows.find((item) => item.id === rowId);
  const reverted = isInvertedDepthRange(row);
  return {
    document: sortDocument(
      reverted ? editRow(lithoDocument, rowId, field, previousValue) : lithoDocument,
    ),
    reverted,
  };
}

function findEditIssue(
  original: RawLithoRow,
  row: RawLithoRow,
  rows: RawLithoRow[],
): RowIssueKind | null {
  const missingBefore = getMissingRequiredFields(original);

  if (getMissingRequiredFields(row).some((field) => !missingBefore.includes(field)))
    return "missingRequiredFields";
  if (isInvertedDepthRange(row)) return "invalidDepthRange";
  if (overlapsAnotherInterval(row, rows)) return "overlappingInterval";
  return null;
}

/*
 * Applies a multi-cell paste as one edit: either every value lands and the rows
 * are re-sorted, or the document is returned unchanged with the reason.
 *
 * A paste may not empty a required field that has a value, invert a depth range
 * or make intervals overlap. Rows keep their ids and complete objects.
 */
export function applyCellEdits(
  lithoDocument: RawLithoDocument,
  edits: CellEdit[],
): { document: RawLithoDocument; issue: RowIssueKind | null } {
  const rows = lithoDocument.rows.map((row) =>
    edits
      .filter((edit) => edit.rowId === String(row.id))
      .reduce(
        (next, edit) =>
          next[edit.columnKey] === edit.value
            ? next
            : { ...next, [edit.columnKey]: edit.value },
        row,
      ),
  );

  let hasChanges = false;

  for (const [index, row] of rows.entries()) {
    const original = lithoDocument.rows[index];
    if (!original || row === original) continue;

    const issue = findEditIssue(original, row, rows);
    if (issue) return { document: lithoDocument, issue };
    hasChanges = true;
  }

  if (!hasChanges) return { document: lithoDocument, issue: null };

  return {
    document: touchRawLithoDocument(lithoDocument, {
      rows: sortRowsByLithoFrom(rows),
    }),
    issue: null,
  };
}

export function addDocumentRow(lithoDocument: RawLithoDocument): {
  document: RawLithoDocument;
  result: AddRowResult;
  issue?: RowIssue | null;
} {
  const last = lithoDocument.rows[lithoDocument.rows.length - 1];
  if (!last) {
    return {
      document: lithoDocument,
      result: { created: false, focusField: "lithoFrom" },
      issue: { issue: "missingRequiredFields", fieldKey: "lithoFrom" },
    };
  }
  const issue = findRowIssue(last, lithoDocument.rows);
  if (issue)
    return {
      document: lithoDocument,
      result: { created: false, rowId: last.id, focusField: issue.fieldKey },
      issue,
    };

  const row = createRowFromPrevious(last, getNextRowId(lithoDocument.rows));
  return {
    document: touchRawLithoDocument(lithoDocument, {
      rows: sortRowsByLithoFrom([...lithoDocument.rows, row]),
    }),
    result: { created: true, rowId: row.id },
  };
}

export function removeDocumentLastRow(
  lithoDocument: RawLithoDocument,
): RawLithoDocument {
  return lithoDocument.rows.length <= 1
    ? lithoDocument
    : touchRawLithoDocument(lithoDocument, { rows: lithoDocument.rows.slice(0, -1) });
}

/*
 * Deletes the rows with these ids (row checkboxes). The table never ends up
 * empty: deleting every row leaves one blank row, like a new document.
 */
export function removeDocumentRows(
  lithoDocument: RawLithoDocument,
  rowIds: readonly RowId[],
): RawLithoDocument {
  const ids = new Set(rowIds.map(String));
  const rows = lithoDocument.rows.filter((row) => !ids.has(String(row.id)));
  if (rows.length === lithoDocument.rows.length) return lithoDocument;

  return touchRawLithoDocument(lithoDocument, {
    rows: rows.length > 0 ? rows : [createSchemaRow(getNextRowId(lithoDocument.rows))],
  });
}

/*
 * Empties the selected cells after the user confirmed it. Unlike a paste, this
 * may empty required cells: the missing-value highlight then shows what still
 * needs filling in. Rows are re-sorted because a depth may have been cleared.
 */
export function clearDocumentCells(
  lithoDocument: RawLithoDocument,
  cells: readonly CellRef[],
): RawLithoDocument {
  let hasChanges = false;
  const rows = lithoDocument.rows.map((row) => {
    const fields = cells
      .filter((cell) => cell.rowId === String(row.id) && row[cell.columnKey] !== "")
      .map((cell) => cell.columnKey);
    if (fields.length === 0) return row;

    hasChanges = true;
    return { ...row, ...Object.fromEntries(fields.map((field) => [field, ""])) };
  });

  return hasChanges
    ? touchRawLithoDocument(lithoDocument, { rows: sortRowsByLithoFrom(rows) })
    : lithoDocument;
}
