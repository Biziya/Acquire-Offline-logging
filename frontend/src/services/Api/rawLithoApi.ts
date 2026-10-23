import type { RowField, LookupRecord } from "../../types/domain";
import { isLookupRecords, isRecord } from "../../types/validation";
import { RAW_LITHO_API_LOOKUP_BY_FIELD } from "../rawLithoLookupConfig";
import { buildApiUrl } from "./apiConfig";

/*
 * All nine Raw Litho lookup lists come from one request,
 * GET /api/table-constants: { caCode: [...], colourCode: [...], ... }.
 * Every page shares it; a failed request is forgotten so the next call asks
 * again. Each list is checked on its own, so one malformed list fails only
 * that lookup.
 */
let tableConstantsRequest: Promise<Record<string, unknown>> | null = null;

function getTableConstants(): Promise<Record<string, unknown>> {
  if (!tableConstantsRequest) {
    const request = fetch(buildApiUrl("/api/table-constants"), {
      headers: { Accept: "application/json" },
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(
            `Table constants request failed with HTTP ${response.status}.`,
          );
        }

        const body: unknown = await response.json();
        if (!isRecord(body)) {
          throw new Error("Table constants API did not return an object.");
        }

        return body;
      })
      .catch((error) => {
        if (tableConstantsRequest === request) tableConstantsRequest = null;
        throw error;
      });

    tableConstantsRequest = request;
  }

  return tableConstantsRequest;
}

export async function getRawLithoLookup(fieldKey: RowField): Promise<LookupRecord[]> {
  const lookup = RAW_LITHO_API_LOOKUP_BY_FIELD[fieldKey];

  if (!lookup) {
    throw new Error(`Unknown Raw Litho lookup: ${fieldKey}`);
  }

  const request = getTableConstants();
  const records = (await request)[lookup.responseKey];
  if (!isLookupRecords(records, lookup.codeProperty)) {
    // Ask the server again next time instead of reusing the bad response.
    if (tableConstantsRequest === request) tableConstantsRequest = null;
    throw new Error(`${lookup.label} list is missing or invalid in the table constants.`);
  }

  return records;
}
