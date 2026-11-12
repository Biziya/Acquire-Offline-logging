import { isDrillhole } from "../../types/validation";
import { buildApiUrl } from "./apiConfig";

export async function getDrillholes(signal?: AbortSignal) {
  // Windows credentials: the backend may read as the signed-in user.
  const response = await fetch(buildApiUrl("/api/drillholes"), {
    credentials: "include",
    signal,
  });

  if (!response.ok) {
    throw new Error(`Drillhole request failed with status ${response.status}.`);
  }

  const records: unknown = await response.json();

  if (!Array.isArray(records) || !records.every(isDrillhole)) {
    throw new Error("The drillhole API returned an invalid response.");
  }

  const uniqueHoleIds = new Set(records.map((record) => record.holeId));

  if (uniqueHoleIds.size !== records.length) {
    throw new Error("The drillhole API returned duplicate holeId values.");
  }

  return records;
}
