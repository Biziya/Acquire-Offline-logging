import type { ImportWriteOptions } from "../../services/IndexDB/rawLithoSaveQueue";
import { rawLithoSaveQueue } from "../../services/IndexDB/rawLithoSaveQueue";
import type { ImportPlan, ImportResult, LookupData } from "../../types/domain";
import { getNextRowId, readRawLithoImport } from "./rawLithoHelpers";
import { hasInvalidLookupValues } from "./rawLithoValidation";
import {
  buildRawLithoDraftKey,
  hasRawLithoDraft,
} from "../../services/IndexDB/rawLithoDraftDb";

/*
 * Reads and fully validates a JSON file without writing to IndexedDB, so an
 * invalid file can never damage the stored working data. The returned plan is
 * what the confirmation dialog describes and what `applyRawLithoImport` writes.
 */
export async function prepareRawLithoImport(
  file: File,
  lookupData: LookupData,
): Promise<ImportPlan> {
  const importedDocument = await readRawLithoImport(file);
  const draftKey = buildRawLithoDraftKey(importedDocument.drillhole);

  if (!draftKey) {
    throw new Error("The imported file does not contain a Drillhole value.");
  }

  const containsUnknownCodes = hasInvalidLookupValues(
    importedDocument.rows,
    lookupData,
    { skipUnavailable: true },
  );

  if (containsUnknownCodes) {
    throw new Error(
      "The imported file contains lookup codes that are not available.",
    );
  }

  return {
    document: importedDocument,
    draftKey,
    drillhole: importedDocument.drillhole,
    rowCount: importedDocument.rows.length,
    willReplaceExistingDraft: await hasExistingDraftSafely(draftKey),
  };
}

async function hasExistingDraftSafely(draftKey: string) {
  try {
    return await hasRawLithoDraft(draftKey);
  } catch (error) {
    console.error("Unable to check for an existing Raw Litho draft.", error);
    throw error;
  }
}

/* Writes the already-validated document. Only called after confirmation. */
export async function applyRawLithoImport(
  importPlan: ImportPlan,
  options: ImportWriteOptions = {},
): Promise<ImportResult | null> {
  const outcome = await rawLithoSaveQueue.commitImport(
    importPlan.draftKey,
    importPlan.document,
    options,
  );
  if (outcome.status === "cancelled") return null;
  if (outcome.status === "failed") throw new Error(outcome.message);

  return {
    document: importPlan.document,
    draftKey: importPlan.draftKey,
    nextRowId: getNextRowId(importPlan.document.rows),
  };
}

export function buildImportConfirmationMessage(importPlan: ImportPlan | null) {
  if (!importPlan) return "";

  const rowLabel = importPlan.rowCount === 1 ? "row" : "rows";
  const target = importPlan.willReplaceExistingDraft
    ? `This will replace the Raw Litho data currently stored on this device for drillhole ${importPlan.drillhole}. Any unsaved local changes for that drillhole will be lost.`
    : `This will store Raw Litho data on this device for drillhole ${importPlan.drillhole}.`;

  return `The file contains ${importPlan.rowCount} ${rowLabel} for drillhole ${importPlan.drillhole}. ${target} This cannot be undone.`;
}
