import { useCallback, useEffect, useRef, useState } from "react";
import {
  clearUploadDataDraft,
  readUploadDataDraft,
  writeUploadDataDraft,
  type UploadDataDraft,
} from "../../services/IndexDB/uploadDataDraftDb";
import { uploadDataConfig } from "./config";

export type DraftSource = Omit<UploadDataDraft, "savedAt">;

function isSameSource(first: DraftSource | null, second: DraftSource) {
  return (
    first !== null &&
    first.document === second.document &&
    first.isEdited === second.isEdited &&
    first.fileName === second.fileName &&
    first.fileSize === second.fileSize
  );
}

/*
 * Keeps the page's working document in IndexedDB.
 *
 * On mount the saved draft is read once and handed to `onRestore`, which may
 * refuse it (returns false) when the user has already picked a file. Nothing is
 * written or deleted until that read has finished, so the empty initial state
 * can never overwrite a saved draft.
 *
 * Afterwards `source` is the single input: a new document is written at once,
 * edits are debounced (the whole document is one write, so it must not happen
 * per keystroke), and `null` — Cancel, a successful upload — deletes the
 * draft. A pending write is flushed when the page unmounts (navigation) or the
 * browser hides it (refresh, closing the tab).
 */
export function useUploadDataDraft(
  source: DraftSource | null,
  onRestore: (draft: UploadDataDraft) => boolean,
) {
  const [isRestoring, setIsRestoring] = useState(true);
  const [saveFailed, setSaveFailed] = useState(false);
  const onRestoreRef = useRef(onRestore);
  const pendingRef = useRef<DraftSource | null>(null);
  const persistedRef = useRef<DraftSource | null>(null);
  const hasDraftRef = useRef(false);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    onRestoreRef.current = onRestore;
  });

  const writePending = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    const pending = pendingRef.current;
    if (!pending) return;
    pendingRef.current = null;
    persistedRef.current = pending;

    writeUploadDataDraft({ ...pending, savedAt: new Date().toISOString() }).then(
      () => setSaveFailed(false),
      (error) => {
        console.error("Unable to save the Upload Data draft.", error);
        // Retried with the next change; the working copy in memory is intact.
        if (persistedRef.current === pending) persistedRef.current = null;
        setSaveFailed(true);
      },
    );
  }, []);

  useEffect(() => {
    let isActive = true;

    readUploadDataDraft()
      .then(
        (draft) => {
          if (!isActive || !draft) return;
          // Refused or not, a draft now exists: the next source replaces it,
          // or deletes it when there is none (Cancel during the read).
          hasDraftRef.current = true;
          if (onRestoreRef.current(draft)) persistedRef.current = draft;
        },
        (error) => console.error("Unable to read the Upload Data draft.", error),
      )
      .finally(() => {
        if (isActive) setIsRestoring(false);
      });

    return () => {
      isActive = false;
    };
  }, []);

  useEffect(() => {
    if (isRestoring) return;

    if (!source) {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
      timerRef.current = null;
      pendingRef.current = null;
      persistedRef.current = null;

      if (hasDraftRef.current) {
        hasDraftRef.current = false;
        setSaveFailed(false);
        clearUploadDataDraft().catch((error) =>
          console.error("Unable to clear the Upload Data draft.", error),
        );
      }
      return;
    }

    if (isSameSource(persistedRef.current, source)) return;

    pendingRef.current = source;
    hasDraftRef.current = true;

    // A freshly loaded file is saved at once; edits wait for typing to pause.
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(
      writePending,
      source.isEdited ? uploadDataConfig.draftSaveDebounceMs : 0,
    );
  }, [isRestoring, source, writePending]);

  // Leaving the page (route change) or the browser hiding it saves what is pending.
  useEffect(() => {
    window.addEventListener("pagehide", writePending);
    return () => {
      window.removeEventListener("pagehide", writePending);
      writePending();
    };
  }, [writePending]);

  return { isRestoring, saveFailed };
}
