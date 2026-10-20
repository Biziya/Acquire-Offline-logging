import { useCallback, useEffect, useRef, useState } from "react";
import type {
  DocumentFallback,
  DraftSession,
  Notify,
  RawLithoDocument,
} from "../../../types/domain";
import { isRecord } from "../../../types/validation";
import {
  buildRawLithoDraftKey,
  readRawLithoDraft,
  readRawLithoSession,
  writeRawLithoSession,
} from "../../../services/IndexDB/rawLithoDraftDb";
import { rawLithoSaveQueue } from "../../../services/IndexDB/rawLithoSaveQueue";
import {
  normalizeRawLithoDocument,
  isStandardRawLithoDocument,
} from "../rawLithoHelpers";
import { isRowOrderSorted, sortRawLithoDocumentRows } from "../rawLithoSorting";
import { createBlankDocument } from "../rawLithoDocumentOperations";
import { TOAST_NOTIFICATIONS } from "../constants";

interface Options {
  selectedHoleId: string;
  currentPage: number;
  buildFallback: (key: string) => DocumentFallback;
  /* `isNew`: no stored draft existed, so this is a freshly created document. */
  onLoaded: (lithoDocument: RawLithoDocument, page: number, isNew: boolean) => void;
  onSessionRestored: (session: DraftSession) => void;
  notify: Notify;
}
const SAVE_DELAY = 400;
const RETRY_DELAY = 2000;
export function useRawLithoDraftPersistence(options: Options) {
  const latest = useRef(options);
  latest.current = options;
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const [isRestoringSession, setIsRestoringSession] = useState(true);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [loadError, setLoadError] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const restoredPage = useRef(1);
  const userSelected = useRef(false);
  const readyKey = useRef<string | null>(null);
  const mounted = useRef(false);
  const reportedSaveError = useRef(false);
  const reportedLoadError = useRef<string | null>(null);
  const draftKey = buildRawLithoDraftKey(options.selectedHoleId);

  const flushPendingSaves = useCallback(async () => {
    clearTimeout(timer.current);
    const success = await rawLithoSaveQueue.flushAll();
    if (mounted.current) {
      setSaveError(!success);
      if (!success && !reportedSaveError.current) {
        latest.current.notify(TOAST_NOTIFICATIONS.draftSaveFailed);
      }
      reportedSaveError.current = !success;
    }
    return success;
  }, []);
  const stageDocument = useCallback(
    (key: string, lithoDocument: RawLithoDocument) => {
      // Called synchronously with edits, before React can batch a drillhole switch.
      rawLithoSaveQueue.stage(key, lithoDocument);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        void flushPendingSaves();
      }, SAVE_DELAY);
    },
    [flushPendingSaves],
  );
  const prepareSelection = useCallback(() => {
    userSelected.current = true;
    readyKey.current = null;
    restoredPage.current = 1;
    setLoadedKey(null);
    setLoadAttempt((attempt) => attempt + 1);
    void flushPendingSaves();
  }, [flushPendingSaves]);
  const canEdit = useCallback(
    (key: string | null) => key !== null && readyKey.current === key,
    [],
  );

  useEffect(() => {
    let active = true;
    mounted.current = true;
    void readRawLithoSession()
      .then((session) => {
        if (active && session && !userSelected.current) {
          restoredPage.current = session.page;
          latest.current.onSessionRestored(session);
        }
      })
      .catch((error) =>
        console.error("Unable to restore Raw Litho session.", error),
      )
      .finally(() => {
        if (active) setIsRestoringSession(false);
      });
    return () => {
      active = false;
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    readyKey.current = null;
    setLoadedKey(null);
    setLoadError(false);
    if (!draftKey) {
      latest.current.onLoaded(createBlankDocument(), 1, false);
      return;
    }
    async function load(key: string) {
      try {
        // An unsaved edit is newer than storage, including after a failed save.
        const saved =
          rawLithoSaveQueue.peek(key) ?? (await readRawLithoDraft(key));
        if (!active) return;
        if (
          saved != null &&
          (!isRecord(saved) ||
            !Array.isArray(saved.rows) ||
            !saved.rows.every(isRecord))
        ) {
          throw new Error(
            "Invalid stored draft. Existing data has been retained.",
          );
        }
        const lithoDocument = sortRawLithoDocumentRows(
          saved != null
            ? normalizeRawLithoDocument(saved, {
                fallback: latest.current.buildFallback(key),
              })
            : createBlankDocument(latest.current.buildFallback(key)),
        );
        if (lithoDocument.drillhole !== key)
          throw new Error("Stored draft does not match selected drillhole.");
        latest.current.onLoaded(lithoDocument, restoredPage.current, saved == null);
        restoredPage.current = 1;
        readyKey.current = key;
        reportedLoadError.current = null;
        setLoadedKey(key);
        if (
          saved != null &&
          (!isStandardRawLithoDocument(saved) || !isRowOrderSorted(saved.rows))
        )
          stageDocument(key, lithoDocument);
      } catch (error) {
        if (!active) return;
        console.error("Unable to load the Raw Litho draft.", error);
        setLoadError(true);
        if (reportedLoadError.current !== key)
          latest.current.notify(TOAST_NOTIFICATIONS.draftLoadFailed);
        reportedLoadError.current = key;
        // Keep editing disabled. Never replace an unreadable draft with a blank.
      }
    }
    void load(draftKey);
    return () => {
      active = false;
    };
  }, [draftKey, loadAttempt, stageDocument]);

  useEffect(() => {
    if (isRestoringSession || (draftKey && loadedKey !== draftKey)) return;
    void writeRawLithoSession({
      drillhole: draftKey ?? "",
      page: options.currentPage,
    }).catch((error) =>
      console.error("Unable to persist Raw Litho session.", error),
    );
  }, [draftKey, isRestoringSession, loadedKey, options.currentPage]);

  const retryLoad = useCallback(
    () => setLoadAttempt((attempt) => attempt + 1),
    [],
  );
  useEffect(() => {
    if (!loadError) return;
    const retry = setTimeout(retryLoad, RETRY_DELAY);
    return () => clearTimeout(retry);
  }, [loadError, loadAttempt, retryLoad]);
  useEffect(() => {
    const flush = () => {
      void flushPendingSaves();
    };
    const hide = () => {
      if (document.visibilityState === "hidden") flush();
    };
    const retry = setInterval(() => {
      if (rawLithoSaveQueue.hasPending()) flush();
    }, RETRY_DELAY);
    window.addEventListener("online", flush);
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", hide);
    return () => {
      clearInterval(retry);
      clearTimeout(timer.current);
      window.removeEventListener("online", flush);
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", hide);
      flush();
    };
  }, [flushPendingSaves]);
  return {
    draftKey,
    isPageEnabled: Boolean(draftKey && loadedKey === draftKey),
    isRestoringSession,
    loadError,
    saveError,
    stageDocument,
    prepareSelection,
    canEdit,
    flushPendingSaves,
    retryLoad,
  };
}
