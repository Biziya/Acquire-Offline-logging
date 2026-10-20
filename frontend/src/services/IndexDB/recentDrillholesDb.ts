import { isRecord } from "../../types/validation";
import { readValue, SESSION_STORE, writeValue } from "./rawLithoDatabase";

/*
 * The drillholes the user selected most recently, most recent first.
 *
 * Stored next to the active session in the existing `session` store, so the
 * ordering survives a reload without a schema change. The ordering rules (how
 * many are kept, where they appear) live in
 * `pages/RawLitho/drillholeOrdering.js`; this module only reads and writes.
 */
const RECENT_DRILLHOLES_KEY = "recent-drillholes";

export function parseStoredHoleIds(holeIds: unknown): string[] {
  if (!Array.isArray(holeIds)) return [];

  const seenHoleIds = new Set<string>();

  return holeIds.filter((holeId): holeId is string => {
    if (typeof holeId !== "string" || holeId.trim() === "") return false;
    if (seenHoleIds.has(holeId)) return false;

    seenHoleIds.add(holeId);
    return true;
  });
}

export async function readRecentDrillholes() {
  const storedValue = await readValue(SESSION_STORE, RECENT_DRILLHOLES_KEY);

  if (!isRecord(storedValue)) return [];

  return parseStoredHoleIds(storedValue.holeIds);
}

export function writeRecentDrillholes(holeIds: readonly string[]) {
  return writeValue(SESSION_STORE, RECENT_DRILLHOLES_KEY, {
    holeIds: [...new Set(holeIds.filter(holeId => holeId.trim() !== ""))],
    updatedAt: new Date().toISOString(),
  });
}
