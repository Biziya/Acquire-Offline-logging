import type {
  Drillhole,
  Notify,
  ToastNotification,
} from "../../../types/domain";
import { isAbortError } from "../../../types/validation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getDrillholes } from "../../../services/Api/drillholeApi";
import {
  readDrillholeCache,
  saveDrillholes,
} from "../../../services/IndexDB/drillholeCacheDb";
import {
  readRecentDrillholes,
  writeRecentDrillholes,
} from "../../../services/IndexDB/recentDrillholesDb";
import {
  addRecentHoleId,
  haveSameHoleIds,
  normalizeRecentHoleIds,
  orderDrillholes,
} from "../drillholeOrdering";
import { TOAST_NOTIFICATIONS } from "../constants";

const OFFLINE_MESSAGE = "Drillhole data unavailable";

function cacheDrillholes(
  records: Drillhole[],
  signal: AbortSignal,
  notify: Notify,
) {
  saveDrillholes(records).catch((error) => {
    console.error("Unable to update the drillhole cache.", error);

    if (signal.aborted) return;
    notify(TOAST_NOTIFICATIONS.drillholeCacheFailed);
  });
}

async function readCachedRecords() {
  try {
    const cachedValue = await readDrillholeCache();
    return cachedValue?.records ?? null;
  } catch (error) {
    console.error("Unable to read the drillhole cache.", error);
    return null;
  }
}

/*
 * Loads the drillholes and hands them over in the order the selector shows:
 * the 3 most recently selected first, then the rest newest first. `drillholes`
 * is the ordered list — nothing downstream re-sorts it.
 */
export function useDrillholes(showToast: Notify) {
  const [drillholes, setDrillholes] = useState<Drillhole[]>([]);
  const [recentHoleIds, setRecentHoleIds] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  // Mirrors `recentHoleIds` so a selection can be recorded without the
  // callback being rebuilt on every change.
  const recentHoleIdsRef = useRef<string[]>([]);

  // Held in a ref so the loader effect runs once, not on every render.
  const showToastRef = useRef(showToast);
  showToastRef.current = showToast;
  const notify = useCallback((notification: ToastNotification) => {
    showToastRef.current?.(notification);
  }, []);

  useEffect(() => {
    const abortController = new AbortController();
    const { signal } = abortController;

    async function loadFromCache() {
      const cachedRecords = await readCachedRecords();
      if (signal.aborted) return;

      if (!cachedRecords) {
        setDrillholes([]);
        setError(OFFLINE_MESSAGE);
        return;
      }

      setDrillholes(cachedRecords);
      setError("");
      notify(TOAST_NOTIFICATIONS.cachedDrillholesLoaded);
    }

    async function loadDrillholes() {
      setIsLoading(true);
      setError("");

      try {
        const records = await getDrillholes(signal);
        if (signal.aborted) return;

        setDrillholes(records);
        cacheDrillholes(records, signal, notify);
      } catch (loadError) {
        if (isAbortError(loadError)) return;

        console.error("Unable to load drillholes from the backend.", loadError);
        await loadFromCache();
      } finally {
        if (!signal.aborted) setIsLoading(false);
      }
    }

    loadDrillholes();
    return () => abortController.abort();
  }, [notify]);

  // --- restore the remembered selections ----------------------------------
  useEffect(() => {
    let isActive = true;

    async function loadRecentHoleIds() {
      try {
        const storedHoleIds = await readRecentDrillholes();
        if (!isActive) return;

        /*
         * Merged rather than assigned: the read is asynchronous, so a drillhole
         * picked before it resolves is already in the ref and has to stay in
         * front of the stored ones.
         */
        const normalizedHoleIds = normalizeRecentHoleIds([
          ...recentHoleIdsRef.current,
          ...storedHoleIds,
        ]);

        recentHoleIdsRef.current = normalizedHoleIds;
        setRecentHoleIds(normalizedHoleIds);
      } catch (readError) {
        console.error("Unable to read the recent drillholes.", readError);
      }
    }

    loadRecentHoleIds();
    return () => {
      isActive = false;
    };
  }, []);

  /*
   * Called when the user picks a drillhole. Reordering the already-selected
   * hole to the front is a no-op, so re-selecting it does not rewrite the
   * store.
   */
  const rememberDrillholeSelection = useCallback((holeId: string) => {
    const currentHoleIds = recentHoleIdsRef.current;
    const nextHoleIds = addRecentHoleId(currentHoleIds, holeId);

    if (haveSameHoleIds(nextHoleIds, currentHoleIds)) return;

    recentHoleIdsRef.current = nextHoleIds;
    setRecentHoleIds(nextHoleIds);

    writeRecentDrillholes(nextHoleIds).catch((writeError) => {
      console.error("Unable to store the recent drillholes.", writeError);
    });
  }, []);

  const orderedDrillholes = useMemo(
    () => orderDrillholes(drillholes, recentHoleIds),
    [drillholes, recentHoleIds],
  );

  return {
    drillholes: orderedDrillholes,
    isLoading,
    error,
    rememberDrillholeSelection,
  };
}
