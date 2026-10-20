import type { Notify } from "../../../types/domain";
import { useCallback, useState } from "react";
import { TOAST_NOTIFICATIONS } from "../constants";

/*
 * The single confirmation flow for removing the last row.
 *
 * The Remove Last Row button and the F5 shortcut both call
 * `requestRemoveLastRow`, so neither can delete anything on its own:
 *
 *   request  →  dialog opens, nothing changed yet
 *   cancel   →  dialog closes, table untouched, no toast
 *   confirm  →  row removed → draft written → dialog closes → "Row removed"
 *
 * Nothing is removed and no success toast is shown until the write resolves.
 */
export function useRemoveRowConfirmation({
  onRemoveLastRow,
  showToast,
}: {
  onRemoveLastRow: () => Promise<boolean>;
  showToast: Notify;
}) {
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [isRemoving, setIsRemoving] = useState(false);

  const requestRemoveLastRow = useCallback(() => {
    setIsConfirmOpen(true);
  }, []);

  const cancelRemoveLastRow = useCallback(() => {
    if (isRemoving) return;

    setIsConfirmOpen(false);
  }, [isRemoving]);

  const confirmRemoveLastRow = useCallback(async () => {
    if (isRemoving) return;

    setIsRemoving(true);

    const wasRemoved = await onRemoveLastRow();

    setIsRemoving(false);
    setIsConfirmOpen(false);

    showToast(
      wasRemoved
        ? TOAST_NOTIFICATIONS.rowRemoved
        : TOAST_NOTIFICATIONS.actionFailed,
    );
  }, [isRemoving, onRemoveLastRow, showToast]);

  return {
    isConfirmOpen,
    isRemoving,
    requestRemoveLastRow,
    cancelRemoveLastRow,
    confirmRemoveLastRow,
  };
}
