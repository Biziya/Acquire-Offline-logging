import type { RawLithoDocument, DraftSession } from "../../types/domain";
import { isRecord } from "../../types/validation";
import {
  deleteValue,
  DRAFT_STORE,
  readEntries,
  readValue,
  SESSION_STORE,
  writeValue,
} from "./rawLithoDatabase";

const ACTIVE_SESSION_KEY = "active-raw-litho-session";

export function buildRawLithoDraftKey(drillhole: unknown) {
  const normalizedDrillhole =
    typeof drillhole === "string" ? drillhole.trim() : "";

  return normalizedDrillhole || null;
}

function unwrapStoredDraft(storedValue: unknown) {
  if (!isRecord(storedValue)) return storedValue;

  return (
    storedValue.document ??
    storedValue.snapshot ??
    storedValue.draft ??
    storedValue.value ??
    storedValue
  );
}

export async function readRawLithoDraft(draftKey: string | null) {
  if (!draftKey) return null;

  return unwrapStoredDraft(await readValue(DRAFT_STORE, draftKey));
}

/* Every stored draft with its drillhole key. Read-only; nothing is changed. */
export async function readRawLithoDrafts() {
  const entries = await readEntries(DRAFT_STORE);

  return entries.flatMap(([key, storedValue]) => {
    const draftKey = buildRawLithoDraftKey(key);
    return draftKey ? [{ draftKey, draft: unwrapStoredDraft(storedValue) }] : [];
  });
}

export function writeRawLithoDraft(
  draftKey: string | null,
  lithoDocument: RawLithoDocument,
) {
  if (!draftKey) {
    return Promise.reject(new Error("A Drillhole draft key is required."));
  }

  return writeValue(DRAFT_STORE, draftKey, lithoDocument);
}

export async function readRawLithoSession() {
  const storedValue = await readValue(SESSION_STORE, ACTIVE_SESSION_KEY);

  if (!isRecord(storedValue)) return null;

  const drillhole = buildRawLithoDraftKey(storedValue.drillhole);
  if (!drillhole) return null;

  // Older sessions also stored a table page; the table no longer pages.
  return { drillhole };
}

export function writeRawLithoSession({ drillhole }: DraftSession) {
  const normalizedDrillhole = buildRawLithoDraftKey(drillhole);

  if (!normalizedDrillhole) {
    return deleteValue(SESSION_STORE, ACTIVE_SESSION_KEY);
  }

  return writeValue(SESSION_STORE, ACTIVE_SESSION_KEY, {
    drillhole: normalizedDrillhole,
    updatedAt: new Date().toISOString(),
  });
}
