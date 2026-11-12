import type { Drillhole } from "../../types/domain";
import { isDrillhole, isRecord } from "../../types/validation";
import {
  DRILLHOLE_CACHE_STORE,
  readValue,
  writeValue,
} from "./rawLithoDatabase";

const CACHE_KEY = "all-drillholes";

function normalizeDrillholes(records: unknown) {
  if (!Array.isArray(records) || !records.every(isDrillhole)) {
    throw new TypeError("Drillhole cache data must be a valid array.");
  }

  return records.map(({ holeId, projectCode, campaign }) => ({
    holeId,
    projectCode,
    campaign,
  }));
}

export function saveDrillholes(records: Drillhole[]) {
  const normalizedRecords = normalizeDrillholes(records);

  return writeValue(DRILLHOLE_CACHE_STORE, CACHE_KEY, {
    records: normalizedRecords,
    updatedAt: new Date().toISOString(),
  });
}

export async function readDrillholeCache() {
  const cachedValue = await readValue(DRILLHOLE_CACHE_STORE, CACHE_KEY);

  if (!isRecord(cachedValue) || !Array.isArray(cachedValue.records))
    return null;
  if (!cachedValue.records.every(isDrillhole)) return null;

  return {
    records: normalizeDrillholes(cachedValue.records),
    updatedAt:
      typeof cachedValue.updatedAt === "string" ? cachedValue.updatedAt : null,
  };
}
