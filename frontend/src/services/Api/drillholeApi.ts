import type { Drillhole } from "../../types/domain";
import { isRecord } from "../../types/validation";
import { buildApiUrl } from "./apiConfig";

function isValidDrillhole(record: unknown): record is Drillhole {
  return (
    isRecord(record) &&
    typeof record.holeId === "string" &&
    record.holeId.trim() !== "" &&
    typeof record.projectCode === "string" &&
    typeof record.campaign === "string"
  );
}

export async function getDrillholes(signal?: AbortSignal) {
  const response = await fetch(buildApiUrl("/api/drillholes"), { signal });

  if (!response.ok) {
    throw new Error(`Drillhole request failed with status ${response.status}.`);
  }

  const records: unknown = await response.json();

  if (!Array.isArray(records) || !records.every(isValidDrillhole)) {
    throw new Error("The drillhole API returned an invalid response.");
  }

  const uniqueHoleIds = new Set(records.map((record) => record.holeId));

  if (uniqueHoleIds.size !== records.length) {
    throw new Error("The drillhole API returned duplicate holeId values.");
  }

  return records;
}
