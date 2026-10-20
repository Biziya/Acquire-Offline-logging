import type {
  RawLithoDocument,
  RawLithoRow,
  RowField,
  RowId,
  Drillhole,
  DocumentFallback,
  Clock,
} from "../../types/domain";
import { COMMENT_FIELD_KEYS, columns, createEmptyRow } from "./constants";
import { sortRawLithoDocumentRows } from "./rawLithoSorting";

let fallbackRowId = 0;

const ROW_FIELD_KEYS = Object.freeze(columns.map((column) => column.key));
const DOCUMENT_KEYS = Object.freeze([
  "project",
  "campaign",
  "drillhole",
  "created_at",
  "modified_at",
  "rows",
]);

class ImportError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = "ImportError";
    this.cause = cause;
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasOwn(value: object, property: string) {
  return Object.prototype.hasOwnProperty.call(value, property);
}

function normalizeText(value: unknown) {
  if (typeof value === "string" || typeof value === "number") {
    return String(value).trim();
  }

  return "";
}

function normalizeFieldValue(fieldKey: RowField, value: unknown) {
  if (COMMENT_FIELD_KEYS.has(fieldKey) && typeof value === "string") {
    return value;
  }

  return normalizeText(value);
}

function firstNonEmptyText(...values: unknown[]) {
  for (const value of values) {
    const normalizedValue = normalizeText(value);
    if (normalizedValue !== "") return normalizedValue;
  }

  return "";
}

function toIsoTimestamp(value: unknown, fallback: string) {
  if (typeof value === "string" && value.trim() !== "") {
    const timestamp = new Date(value);
    if (Number.isFinite(timestamp.getTime())) return timestamp.toISOString();
  }

  return fallback;
}

function getCurrentTimestamp(now: Clock | string) {
  const timestamp = typeof now === "function" ? now() : now;
  return toIsoTimestamp(timestamp, new Date().toISOString());
}

function isValidRowId(rowId: unknown): rowId is RowId {
  return (
    (typeof rowId === "string" && rowId.trim() !== "") ||
    (typeof rowId === "number" && Number.isFinite(rowId))
  );
}

function createStableRowId(usedIds: Set<string>) {
  let rowId;

  do {
    if (typeof crypto !== "undefined" && crypto.randomUUID) {
      rowId = `row-${crypto.randomUUID()}`;
    } else {
      fallbackRowId += 1;
      rowId = `row-${Date.now()}-${fallbackRowId}`;
    }
  } while (usedIds.has(String(rowId)));

  return rowId;
}

export function normalizeRawLithoRows(rows: unknown): RawLithoRow[] {
  const usedIds = new Set<string>();
  const sourceRows: unknown[] = Array.isArray(rows) ? rows : [];

  const normalizedRows = sourceRows.filter(isObject).map((row) => {
    const canPreserveId = isValidRowId(row.id) && !usedIds.has(String(row.id));
    const rowId =
      canPreserveId && isValidRowId(row.id)
        ? row.id
        : createStableRowId(usedIds);

    usedIds.add(String(rowId));

    const normalized = createEmptyRow(rowId);
    for (const fieldKey of ROW_FIELD_KEYS)
      normalized[fieldKey] = normalizeFieldValue(fieldKey, row[fieldKey]);
    return normalized;
  });

  if (normalizedRows.length === 0) {
    normalizedRows.push(createEmptyRow(createStableRowId(usedIds)));
  }

  return normalizedRows;
}

export function normalizeRawLithoDocument(
  value: unknown,
  {
    fallback = {},
    now = () => new Date().toISOString(),
  }: { fallback?: DocumentFallback; now?: Clock } = {},
) {
  const source = isObject(value) ? value : {};
  const normalizedNow = getCurrentTimestamp(now);
  const project = firstNonEmptyText(
    source.project,
    source.projectCode,
    fallback.project,
  );
  const campaign = firstNonEmptyText(source.campaign, fallback.campaign);
  const drillhole = firstNonEmptyText(
    source.drillhole,
    source.holeId,
    fallback.drillhole,
  );
  const createdAt = toIsoTimestamp(
    source.created_at ??
      source.createdAt ??
      fallback.created_at ??
      fallback.createdAt,
    normalizedNow,
  );
  const modifiedAt = toIsoTimestamp(
    source.modified_at ??
      source.modifiedAt ??
      fallback.modified_at ??
      fallback.modifiedAt,
    createdAt,
  );

  return {
    project,
    campaign,
    drillhole,
    created_at: createdAt,
    modified_at: modifiedAt,
    rows: normalizeRawLithoRows(source.rows),
  };
}

export function createRawLithoDocument(
  {
    project = "",
    campaign = "",
    drillhole = "",
    rows = [],
  }: Partial<RawLithoDocument> = {},
  now = () => new Date().toISOString(),
) {
  const timestamp = getCurrentTimestamp(now);

  return normalizeRawLithoDocument(
    {
      project,
      campaign,
      drillhole,
      created_at: timestamp,
      modified_at: timestamp,
      rows,
    },
    { now: () => timestamp },
  );
}

export function touchRawLithoDocument(
  lithoDocument: Partial<RawLithoDocument>,
  changes: Partial<RawLithoDocument> = {},
  now = () => new Date().toISOString(),
) {
  const normalizedDocument = normalizeRawLithoDocument(lithoDocument, { now });
  const modifiedAt = getCurrentTimestamp(now);

  return normalizeRawLithoDocument(
    {
      ...normalizedDocument,
      ...changes,
      created_at: normalizedDocument.created_at,
      modified_at: modifiedAt,
    },
    { now: () => modifiedAt },
  );
}

export function isStandardRawLithoDocument(
  value: unknown,
): value is RawLithoDocument {
  if (
    !isObject(value) ||
    !DOCUMENT_KEYS.every((key) => hasOwn(value, key)) ||
    ![value.project, value.campaign, value.drillhole].every(
      (item) => typeof item === "string",
    ) ||
    !Array.isArray(value.rows)
  ) {
    return false;
  }

  const createdAt = toIsoTimestamp(value.created_at, "");
  const modifiedAt = toIsoTimestamp(value.modified_at, "");
  if (
    !createdAt ||
    !modifiedAt ||
    createdAt !== value.created_at ||
    modifiedAt !== value.modified_at
  ) {
    return false;
  }

  const usedIds = new Set<string>();

  return value.rows.every((row) => {
    if (!isObject(row) || !isValidRowId(row.id)) return false;
    if (usedIds.has(String(row.id))) return false;
    usedIds.add(String(row.id));

    return ROW_FIELD_KEYS.every(
      (fieldKey) => hasOwn(row, fieldKey) && typeof row[fieldKey] === "string",
    );
  });
}

export function buildRawLithoSnapshot(
  selectedDrillhole: Drillhole | null,
  rows: RawLithoRow[],
  previousDocument: Partial<RawLithoDocument> = {},
) {
  return touchRawLithoDocument(previousDocument, {
    project: selectedDrillhole?.projectCode ?? previousDocument.project ?? "",
    campaign: selectedDrillhole?.campaign ?? previousDocument.campaign ?? "",
    drillhole: selectedDrillhole?.holeId ?? previousDocument.drillhole ?? "",
    rows,
  });
}

export function getNextRowId(rows: RawLithoRow[]) {
  const numericIds = rows
    .map((row) => Number(row.id))
    .filter((id) => Number.isInteger(id) && id > 0);

  return numericIds.length === 0 ? 1 : Math.max(...numericIds) + 1;
}

function validateImportDocument(value: unknown) {
  if (!isObject(value)) {
    throw new ImportError(
      "The JSON file does not contain a valid Raw Litho document.",
    );
  }

  const missingProperty = DOCUMENT_KEYS.find((key) => !hasOwn(value, key));
  if (missingProperty) {
    throw new ImportError(
      `The imported file is missing the required ${missingProperty} property.`,
    );
  }

  if (!Array.isArray(value.rows)) {
    throw new ImportError("The imported rows value must be an array.");
  }

  if (normalizeText(value.drillhole) === "") {
    throw new ImportError("The imported drillhole value is required.");
  }

  if (value.rows.some((row) => !isObject(row))) {
    throw new ImportError("Every imported row must be a JSON object.");
  }
}

export async function readRawLithoImport(file: File) {
  let fileText;

  try {
    fileText = await file.text();
  } catch (error) {
    throw new ImportError("The selected JSON file could not be read.", error);
  }

  let importedValue: unknown;

  try {
    importedValue = JSON.parse(fileText);
  } catch (error) {
    throw new ImportError("The selected file is not valid JSON.", error);
  }

  validateImportDocument(importedValue);

  // Sorted here so the document written to IndexedDB and the document handed to
  // the table share one row order.
  return sortRawLithoDocumentRows(
    touchRawLithoDocument(normalizeRawLithoDocument(importedValue)),
  );
}

function createExportFilename(drillhole: string) {
  const safeDrillhole = normalizeText(drillhole)
    // Export filenames must replace ASCII control characters.
    // eslint-disable-next-line no-control-regex
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_")
    .trim();

  return `${safeDrillhole || "raw-litho"}.json`;
}

export function exportRawLithoSnapshot(rawLithoDocument: RawLithoDocument) {
  const normalizedDocument = normalizeRawLithoDocument(rawLithoDocument);
  const file = new Blob([JSON.stringify(normalizedDocument, null, 2)], {
    type: "application/json",
  });
  const downloadUrl = URL.createObjectURL(file);
  const downloadLink = document.createElement("a");

  downloadLink.href = downloadUrl;
  downloadLink.download = createExportFilename(normalizedDocument.drillhole);
  downloadLink.click();

  URL.revokeObjectURL(downloadUrl);
}
