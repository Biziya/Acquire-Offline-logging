import { useEffect, useRef } from "react";

interface ConfirmDialogProps {
  title: string;
  message: string;
  details?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  busyLabel?: string;
  isBusy?: boolean;
  initialFocus?: "cancel" | "confirm";
  onConfirm: () => void;
  onCancel: () => void;
}


/*
 * Shared confirmation modal. Used by the JSON import confirmation and by the
 * Remove Last Row confirmation.
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
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
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
    <div className="raw-litho-dialog-backdrop" role="presentation">
      <div
        className="raw-litho-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="raw-litho-dialog-title"
        aria-describedby="raw-litho-dialog-message"
      >
        <h2 className="raw-litho-dialog-title" id="raw-litho-dialog-title">
          {title}
        </h2>

        <p className="raw-litho-dialog-message" id="raw-litho-dialog-message">
          {message}
        </p>

        {details && <p className="raw-litho-dialog-details">{details}</p>}

        <div className="raw-litho-dialog-actions">
          <button
            ref={cancelButtonRef}
            className="raw-litho-dialog-button"
            type="button"
            onClick={onCancel}
            disabled={isBusy}
          >
            {cancelLabel}
          </button>

          <button
            ref={confirmButtonRef}
            className="raw-litho-dialog-button raw-litho-dialog-button--danger"
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
