import { useCallback, useEffect, useRef, useState } from "react";
import type { ChangeEvent } from "react";
import type {
  LookupData,
  ImportPlan,
  ImportResult,
  Notify,
} from "../../../types/domain";
import { errorMessage } from "../../../types/validation";
import { TOAST_NOTIFICATIONS } from "../constants";
import { applyRawLithoImport, prepareRawLithoImport } from "../rawLithoImportService";

export type ImportStatus =
  | "idle"
  | "preparing"
  | "pending"
  | "saving"
  | "completed"
  | "failed"
  | "cancelled";

interface ImportOptions {
  lookupData: LookupData;
  onImported: (result: ImportResult) => void;
  showToast: Notify;
  selectionKey?: string;
}

interface ActiveAttempt {
  controller: AbortController;
  writeStarted: boolean;
}

/**
 * Pending means prepared and awaiting confirmation. Failed imports require an
 * explicit retry; they are never left in the autosave queue. Cancel is allowed
 * before the replacement write starts, never after it may have committed.
 */
export function useRawLithoImport({
  lookupData,
  onImported,
  showToast,
  selectionKey = "",
}: ImportOptions) {
  const [pendingImport, setPendingImport] = useState<ImportPlan | null>(null);
  const [status, setStatus] = useState<ImportStatus>("idle");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const planRef = useRef<ImportPlan | null>(null);
  const attemptRef = useRef<ActiveAttempt | null>(null);
  const generation = useRef(0);
  const mounted = useRef(false);
  const preparing = useRef(false);
  const latest = useRef({ lookupData, onImported, showToast, selectionKey });
  latest.current = { lookupData, onImported, showToast, selectionKey };

  const resetFileInput = useCallback(() => {
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, []);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      generation.current += 1;
      attemptRef.current?.controller.abort();
    };
  }, []);

  useEffect(() => {
    // Switching context invalidates UI completion and stops an unstarted write.
    // A submitted write is allowed to settle, without selecting an old drillhole.
    generation.current += 1;
    attemptRef.current?.controller.abort();
    preparing.current = false;
    planRef.current = null;
    setPendingImport(null);
    setStatus("idle");
  }, [selectionKey]);

  const openFilePicker = useCallback(() => {
    if (attemptRef.current) return;
    resetFileInput();
    fileInputRef.current?.click();
  }, [resetFileInput]);

  const selectFile = useCallback(async (event: ChangeEvent<HTMLInputElement>) => {
    if (attemptRef.current) return;
    const file = event.target.files?.[0];
    if (!file) return;
    const request = ++generation.current;
    const selectedAtStart = latest.current.selectionKey;
    const isCurrent = () =>
      mounted.current &&
      request === generation.current &&
      selectedAtStart === latest.current.selectionKey;
    planRef.current = null;
    setPendingImport(null);
    preparing.current = true;
    setStatus("preparing");

    try {
      const plan = await prepareRawLithoImport(file, latest.current.lookupData);
      if (!isCurrent()) return;
      planRef.current = plan;
      setPendingImport(plan);
      setStatus("pending");
    } catch (error) {
      if (!isCurrent()) return;
      setStatus("failed");
      latest.current.showToast({
        ...TOAST_NOTIFICATIONS.importFailed,
        message: errorMessage(error) || TOAST_NOTIFICATIONS.importFailed.message,
      });
    } finally {
      if (isCurrent()) {
        preparing.current = false;
        resetFileInput();
      }
    }
  }, [resetFileInput]);

  const cancelImport = useCallback(() => {
    const attempt = attemptRef.current;
    if (!attempt && !planRef.current && !preparing.current) return false;
    if (attempt?.writeStarted) return false;
    attempt?.controller.abort();
    attemptRef.current = null;
    generation.current += 1;
    preparing.current = false;
    planRef.current = null;
    setPendingImport(null);
    setStatus("cancelled");
    resetFileInput();
    latest.current.showToast(TOAST_NOTIFICATIONS.importCancelled);
    return true;
  }, [resetFileInput]);

  const confirmImport = useCallback(async () => {
    const plan = planRef.current;
    if (!plan || attemptRef.current) return;
    const request = ++generation.current;
    const selectedAtStart = latest.current.selectionKey;
    const isCurrent = () =>
      mounted.current &&
      request === generation.current &&
      selectedAtStart === latest.current.selectionKey;
    const attempt: ActiveAttempt = {
      controller: new AbortController(),
      writeStarted: false,
    };
    attemptRef.current = attempt;
    setStatus("saving");

    try {
      const result = await applyRawLithoImport(plan, {
        signal: attempt.controller.signal,
        onWriteStarted: () => {
          if (!isCurrent()) throw new Error("Import context changed before saving.");
          attempt.writeStarted = true;
        },
      });
      if (!isCurrent()) return;
      if (!result) {
        planRef.current = null;
        setPendingImport(null);
        setStatus("cancelled");
        latest.current.showToast(TOAST_NOTIFICATIONS.importCancelled);
        return;
      }
      planRef.current = null;
      setPendingImport(null);
      setStatus("completed");
      latest.current.onImported(result);
      latest.current.showToast(TOAST_NOTIFICATIONS.importSuccess);
    } catch (error) {
      if (!isCurrent()) return;
      setStatus("failed");
      latest.current.showToast({
        ...TOAST_NOTIFICATIONS.importFailed,
        message: errorMessage(error) || TOAST_NOTIFICATIONS.importFailed.message,
      });
    } finally {
      if (attemptRef.current === attempt) attemptRef.current = null;
      if (isCurrent()) resetFileInput();
    }
  }, [resetFileInput]);

  return {
    fileInputRef,
    pendingImport,
    status,
    isImporting: status === "saving",
    openFilePicker,
    selectFile,
    cancelImport,
    confirmImport,
  };
}
