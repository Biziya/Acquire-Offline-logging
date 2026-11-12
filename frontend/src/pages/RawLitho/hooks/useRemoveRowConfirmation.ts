import type { Notify } from "../../../types/domain";
import { useCallback, useState } from "react";
import { TOAST_NOTIFICATIONS } from "../constants";

/*
 * The Remove last row button and F5 both open the confirmation. The row is
 * removed, and "Row removed" shown, only after the draft write finishes.
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
