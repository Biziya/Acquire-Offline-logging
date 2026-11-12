import { useEffect, useId, useRef } from "react";
import {
  DANGER_FILLED_BUTTON,
  PRIMARY_BUTTON,
  SECONDARY_BUTTON,
} from "./uiStyles";

interface ConfirmDialogProps {
  title: string;
  message: string;
  // Label / value pairs shown in a small box under the message
  // (records, drillhole, …).
  facts?: ReadonlyArray<readonly [string, string]>;
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
 * Shared confirmation modal: a body (title, message, optional facts) above a footer bar with the buttons. Used by the JSON import, Remove
 * last row, the Upload Data database upload and Upload Data's Cancel.
 *
 * `initialFocus` defaults to the cancel button: for a destructive dialog the
 * safe option should be the one Enter reaches first.
 */
function ConfirmDialog({
  title,
  message,
  facts,
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
        className="w-[min(440px,100%)] animate-dialog-in overflow-hidden rounded-ui border border-rl-border bg-white shadow-popup"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={`${id}-title`}
        aria-describedby={`${id}-message`}
      >
        <div className="px-5 pt-5 pb-4">
          <h2
            className="m-0 text-[1.0625rem] leading-snug font-bold text-rl-text"
            id={`${id}-title`}
          >
            {title}
          </h2>

          <p
            className="mt-1.5 mb-0 text-[0.875rem] leading-normal text-rl-text"
            id={`${id}-message`}
          >
            {message}
          </p>

          {facts && facts.length > 0 && (
            <dl className="mt-3 mb-0 grid gap-1 rounded-ui border border-rl-grid bg-rl-navy-softer px-3 py-2 text-[0.8125rem]">
              {facts.map(([label, value]) => (
                <div key={label} className="flex justify-between gap-4">
                  <dt className="text-rl-text-muted">{label}</dt>
                  <dd className="m-0 min-w-0 truncate font-semibold text-rl-text tabular-nums" title={value}>
                    {value}
                  </dd>
                </div>
              ))}
            </dl>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-rl-border bg-rl-navy-softer px-5 py-3">
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
