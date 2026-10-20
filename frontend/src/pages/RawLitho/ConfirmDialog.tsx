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


// Shared by both buttons; each adds its colours. The disabled look wins over
// either colour scheme while a confirmed action is in flight.
const DIALOG_BUTTON = [
  "h-[34px] cursor-pointer rounded-[7px] border px-4 text-[0.85rem] font-semibold",
  "transition-[background-color,border-color,color,box-shadow,transform] duration-140",
  "focus-visible:outline-2 focus-visible:outline-offset-1",
  "enabled:active:translate-y-px enabled:active:shadow-none",
  "disabled:cursor-not-allowed disabled:border-rl-border disabled:bg-rl-navy-softer",
  "disabled:text-rl-disabled disabled:shadow-none",
].join(" ");

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
    <div
      className="fixed inset-0 z-[2000] flex animate-backdrop-in items-center justify-center bg-[rgb(10_29_51/52%)] p-4"
      role="presentation"
    >
      <div
        className="w-[min(400px,100%)] animate-dialog-in rounded-xl border border-rl-border bg-white px-[22px] pt-5 pb-[18px] shadow-[0_1px_2px_rgb(16_35_61/10%),0_20px_48px_rgb(16_35_61/26%)]"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="raw-litho-dialog-title"
        aria-describedby="raw-litho-dialog-message"
      >
        <h2
          className="m-0 mb-1.5 text-base font-[650] tracking-[-0.01em] text-rl-navy"
          id="raw-litho-dialog-title"
        >
          {title}
        </h2>

        <p
          className="m-0 text-[0.85rem] leading-normal text-rl-text-muted"
          id="raw-litho-dialog-message"
        >
          {message}
        </p>

        {details && (
          <p className="mt-2 mb-0 text-[0.78rem] leading-[1.45] text-rl-text-muted">
            {details}
          </p>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <button
            ref={cancelButtonRef}
            className={`${DIALOG_BUTTON} border-rl-border-strong bg-white text-rl-navy focus-visible:outline-rl-cell-ring enabled:hover:border-rl-navy enabled:hover:bg-rl-navy-soft`}
            type="button"
            onClick={onCancel}
            disabled={isBusy}
          >
            {cancelLabel}
          </button>

          <button
            ref={confirmButtonRef}
            className={`${DIALOG_BUTTON} border-transparent bg-rl-danger text-white shadow-[0_1px_2px_rgb(180_35_24/30%)] focus-visible:outline-rl-danger enabled:hover:bg-rl-danger-dark enabled:hover:shadow-[0_2px_8px_rgb(180_35_24/32%)]`}
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
