import type { RowField, LookupRecord } from "../../types/domain";
import { isLookupRecords } from "../../types/validation";
import { RAW_LITHO_API_LOOKUP_BY_FIELD } from "../rawLithoLookupConfig";
import { buildApiUrl } from "./apiConfig";

const requestByField = new Map<RowField, Promise<LookupRecord[]>>();

export function getRawLithoLookup(fieldKey: RowField): Promise<LookupRecord[]> {
  const lookup = RAW_LITHO_API_LOOKUP_BY_FIELD[fieldKey];

  if (!lookup) {
    return Promise.reject(new Error(`Unknown Raw Litho lookup: ${fieldKey}`));
  }

  const existing = requestByField.get(fieldKey);
  if (existing) return existing;
  {
    const request = fetch(buildApiUrl(lookup.endpoint), {
      headers: { Accept: "application/json" },
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(
            `${lookup.label} request failed with HTTP ${response.status}.`,
          );
        }

        const records: unknown = await response.json();
        if (!isLookupRecords(records, lookup.codeProperty)) {
          throw new Error(`${lookup.label} API did not return an array.`);
        }

        return records;
      })
      .catch((error) => {
        requestByField.delete(fieldKey);
        throw error;
      });

    requestByField.set(fieldKey, request);
    return request;
  }
}
