import type { ImportWriteOptions } from "../../services/IndexDB/rawLithoSaveQueue";
import { rawLithoSaveQueue } from "../../services/IndexDB/rawLithoSaveQueue";
import type { ImportPlan, ImportResult, LookupData } from "../../types/domain";
import { readRawLithoImport } from "./rawLithoHelpers";
import { hasInvalidLookupValues } from "./rawLithoValidation";
import {
  buildRawLithoDraftKey,
  readRawLithoDraft,
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
  // readRawLithoImport already rejects a file without a drillhole.
  const draftKey = buildRawLithoDraftKey(importedDocument.drillhole) ?? "";

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
    willReplaceExistingDraft: Boolean(await readRawLithoDraft(draftKey)),
  };
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
  };
}

export function buildImportConfirmationMessage(importPlan: ImportPlan) {
  return importPlan.willReplaceExistingDraft
    ? "It replaces the data saved on this PC for this drillhole. You can't undo this."
    : "The rows will be saved on this PC.";
}

// Shown in the confirmation's facts box, under the message.
export function buildImportConfirmationFacts(importPlan: ImportPlan) {
  return [
    ["Drillhole", importPlan.document.drillhole],
    ["Rows", String(importPlan.document.rows.length)],
  ] as const;
}
