import { useEffect, useId, useRef } from "react";
import {
  DANGER_FILLED_BUTTON,
  DIALOG_TITLE,
  PRIMARY_BUTTON,
  SECONDARY_BUTTON,
} from "../../components/uiStyles";

interface ConfirmDialogProps {
  title: string;
  message: string;
  details?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  busyLabel?: string;
  isBusy?: boolean;
  initialFocus?: "cancel" | "confirm";
  // "danger" (default) for destructive actions; "primary" for a safe commit.
  tone?: "danger" | "primary";
  onConfirm: () => void;
  onCancel: () => void;
}


// The confirm button: red when it removes data, navy otherwise.
const CONFIRM_TONE = {
  danger: DANGER_FILLED_BUTTON,
  primary: PRIMARY_BUTTON,
};

/*
 * Shared confirmation modal. Used by the JSON import confirmation, the
 * Remove Last Row confirmation and the Upload Data database upload.
 *
 * `initialFocus` defaults to the cancel button: for a destructive dialog the
 * safe option should be the one Enter reaches first.
 */
function ConfirmDialog({
  title,
  message,
  details,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  busyLabel,
  isBusy = false,
  initialFocus = "cancel",
  tone = "danger",
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const id = useId();
  const confirmButtonRef = useRef<HTMLButtonElement>(null);
  const cancelButtonRef = useRef<HTMLButtonElement>(null);

  // Declared before the focus effect below so it captures the element that
  // was focused *outside* the dialog, not the button we are about to focus.
  useEffect(() => {
    const previouslyFocused = document.activeElement;

    return () => {
      // Skip if the element has since left the document.
      if (!previouslyFocused?.isConnected) return;

      if (previouslyFocused instanceof HTMLElement) previouslyFocused.focus();
    };
  }, []);

  useEffect(() => {
    const target =
      initialFocus === "confirm"
        ? confirmButtonRef.current
        : cancelButtonRef.current;

    target?.focus();
  }, [initialFocus]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (isBusy || event.key !== "Escape") return;

      event.preventDefault();
      onCancel();
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isBusy, onCancel]);

  return (
    <div
      className="fixed inset-0 z-[2000] flex animate-backdrop-in items-center justify-center bg-rl-navy-darker/45 p-4"
      role="presentation"
    >
      <div
        className="w-[min(400px,100%)] animate-dialog-in rounded-ui border border-rl-border bg-white px-[22px] pt-5 pb-[18px] shadow-popup"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={`${id}-title`}
        aria-describedby={`${id}-message`}
      >
        <h2
          className={`${DIALOG_TITLE} mb-1.5`}
          id={`${id}-title`}
        >
          {title}
        </h2>

        <p
          className="m-0 text-[0.875rem] leading-normal text-rl-text-muted"
          id={`${id}-message`}
        >
          {message}
        </p>

        {details && (
          <p className="mt-2 mb-0 text-[0.8125rem] leading-[1.45] text-rl-text-muted">
            {details}
          </p>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <button
            ref={cancelButtonRef}
            className={SECONDARY_BUTTON}
            type="button"
            onClick={onCancel}
            disabled={isBusy}
          >
            {cancelLabel}
          </button>

          <button
            ref={confirmButtonRef}
            className={CONFIRM_TONE[tone]}
            type="button"
            onClick={onConfirm}
            disabled={isBusy}
          >
            {isBusy && busyLabel ? busyLabel : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export default ConfirmDialog;
