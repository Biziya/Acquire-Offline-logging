import type {
  AddRowResult,
  DocumentFallback,
  RawLithoDocument,
  RowIssue,
  RowField,
  RowId,
} from "../../types/domain";
import { createEmptyRow, createRowFromPrevious } from "./constants";
import {
  createRawLithoDocument,
  getNextRowId,
  touchRawLithoDocument,
} from "./rawLithoHelpers";
import { findRowIssue, isInvertedDepthRange } from "./rawLithoValidation";
import { sortRowsByLithoFrom } from "./rawLithoSorting";

export function createBlankDocument(
  fallback: DocumentFallback = {},
): RawLithoDocument {
  return createRawLithoDocument({ ...fallback, rows: [createEmptyRow(1)] });
}

export function editRow(
  lithoDocument: RawLithoDocument,
  rowId: RowId,
  field: RowField,
  value: string,
): RawLithoDocument {
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
