import type { Drillhole } from "../../types/domain";
import { isRecord } from "../../types/validation";
import {
  deleteValue,
  DRILLHOLE_CACHE_STORE,
  readValue,
  writeValue,
} from "./rawLithoDatabase";

const CACHE_KEY = "all-drillholes";

function isValidDrillhole(record: unknown): record is Drillhole {
  return (
    isRecord(record) &&
    !Array.isArray(record) &&
    typeof record.holeId === "string" &&
    record.holeId.trim() !== "" &&
    typeof record.projectCode === "string" &&
    typeof record.campaign === "string"
  );
}

function normalizeDrillholes(records: unknown) {
  if (!Array.isArray(records) || !records.every(isValidDrillhole)) {
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
  if (!cachedValue.records.every(isValidDrillhole)) return null;

  return {
    records: normalizeDrillholes(cachedValue.records),
    updatedAt:
      typeof cachedValue.updatedAt === "string" ? cachedValue.updatedAt : null,
  };
}

export async function getCachedDrillholes() {
  try {
    const cachedValue = await readDrillholeCache();
    return cachedValue?.records ?? [];
  } catch (error) {
    console.error("Unable to read the drillhole cache.", error);
    return [];
  }
}

export function clearDrillholeCache() {
  return deleteValue(DRILLHOLE_CACHE_STORE, CACHE_KEY);
}
