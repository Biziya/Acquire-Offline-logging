import type { RawLithoDocument, DraftSession } from "../../types/domain";
import { isRecord } from "../../types/validation";
import {
  deleteValue,
  DRAFT_STORE,
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

export function writeRawLithoDraft(
  draftKey: string | null,
  lithoDocument: RawLithoDocument,
) {
  if (!draftKey) {
    return Promise.reject(new Error("A Drillhole draft key is required."));
  }

  return writeValue(DRAFT_STORE, draftKey, lithoDocument);
}

export function deleteRawLithoDraft(draftKey: string | null) {
  if (!draftKey) return Promise.resolve();

  return deleteValue(DRAFT_STORE, draftKey);
}

export async function hasRawLithoDraft(draftKey: string | null) {
  if (!draftKey) return false;

  return Boolean(await readRawLithoDraft(draftKey));
}

function normalizePage(page: unknown) {
  const parsedPage = Number(page);

  return Number.isFinite(parsedPage) && parsedPage >= 1
    ? Math.floor(parsedPage)
    : 1;
}

export async function readRawLithoSession() {
  const storedValue = await readValue(SESSION_STORE, ACTIVE_SESSION_KEY);

  if (!isRecord(storedValue)) return null;

  const drillhole = buildRawLithoDraftKey(storedValue.drillhole);
  if (!drillhole) return null;

  return { drillhole, page: normalizePage(storedValue.page) };
}

export function writeRawLithoSession({ drillhole, page }: DraftSession) {
  const normalizedDrillhole = buildRawLithoDraftKey(drillhole);

  if (!normalizedDrillhole) {
    return deleteValue(SESSION_STORE, ACTIVE_SESSION_KEY);
  }

  return writeValue(SESSION_STORE, ACTIVE_SESSION_KEY, {
    drillhole: normalizedDrillhole,
    page: normalizePage(page),
    updatedAt: new Date().toISOString(),
  });
}
