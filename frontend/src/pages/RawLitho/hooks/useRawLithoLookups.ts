import type {
  LookupData,
  LookupStatuses,
  LookupStatus,
  RowField,
  LookupRecord,
  ApiLookupDefinition,
} from "../../../types/domain";
import { isLookupRecords } from "../../../types/validation";
import { useEffect, useState } from "react";
import { getRawLithoLookup } from "../../../services/Api/rawLithoApi";
import {
  readLookupCache,
  saveLookupCache,
} from "../../../services/IndexDB/rawLithoLookupCacheDb";
import { RAW_LITHO_LOOKUPS } from "../../../services/rawLithoLookupConfig";

function createInitialLookupData(): LookupData {
  return Object.fromEntries(
    RAW_LITHO_LOOKUPS.map((lookup) => [lookup.fieldKey, []]),
  );
}

function createInitialLookupStatus(): LookupStatuses {
  return Object.fromEntries(
    RAW_LITHO_LOOKUPS.map((lookup) => [
      lookup.fieldKey,
      { isLoading: true, error: "", source: null },
    ]),
  );
}

export function useRawLithoLookups() {
  const [lookupData, setLookupData] = useState(createInitialLookupData);
  const [lookupStatus, setLookupStatus] = useState(createInitialLookupStatus);

  useEffect(() => {
    const abortController = new AbortController();
    const { signal } = abortController;

    function setRecords(fieldKey: RowField, records: LookupRecord[]) {
      setLookupData((currentData) => ({ ...currentData, [fieldKey]: records }));
    }

    function setStatus(fieldKey: RowField, status: LookupStatus) {
      setLookupStatus((currentStatus) => ({
        ...currentStatus,
        [fieldKey]: { ...currentStatus[fieldKey], ...status },
      }));
    }

    async function loadFromCache(lookup: ApiLookupDefinition) {
      try {
        const cachedValue = await readLookupCache(lookup.cacheKey);
        if (signal.aborted) return false;
        if (
          !cachedValue?.records?.length ||
          !isLookupRecords(cachedValue.records, lookup.codeProperty)
        )
          return false;

        setRecords(lookup.fieldKey, cachedValue.records);
        setStatus(lookup.fieldKey, {
          isLoading: true,
          error: "",
          source: "cache",
        });
        return true;
      } catch (error) {
        console.error(
          `Unable to read the ${lookup.label} lookup cache.`,
          error,
        );
        return false;
      }
    }

    async function loadLookup(lookup: ApiLookupDefinition) {
      setStatus(lookup.fieldKey, { isLoading: true, error: "", source: null });
      const hasCachedRecords = await loadFromCache(lookup);

      try {
        const records = await getRawLithoLookup(lookup.fieldKey);
        if (signal.aborted) return;

        setRecords(lookup.fieldKey, records);
        setStatus(lookup.fieldKey, {
          isLoading: false,
          error: "",
          source: "backend",
        });

        saveLookupCache(lookup.cacheKey, records).catch((error) =>
          console.error(`Unable to update the ${lookup.label} cache.`, error),
        );
      } catch (error) {
        console.error(`Unable to load ${lookup.label} values.`, error);
        if (signal.aborted) return;

        setStatus(lookup.fieldKey, {
          isLoading: false,
          error: hasCachedRecords
            ? ""
            : `${lookup.label} unavailable`,
          source: hasCachedRecords ? "cache" : null,
        });
      }
    }

    RAW_LITHO_LOOKUPS.forEach(loadLookup);
    return () => abortController.abort();
  }, []);

  return { lookupData, lookupStatus };
}
