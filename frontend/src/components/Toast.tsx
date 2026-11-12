import type { ToastNotification } from "../types/domain";
import { useEffect, useRef, useState } from "react";
import { uiConfig } from "../config/uiConfig";

interface ToastProps {
  message: string;
  type: ToastNotification["type"];
  isVisible: boolean;
  onClose: () => void;
}

/*
 * The one toast used by every page. One at a time: a new notification
 * replaces the visible one, and the caller renders it with `key={toast.id}`,
 * so showing the same message again remounts it and restarts its timer.
 *
 * Success, warning and info hide after their config/ui.yaml duration. An
 * error stays until the user closes it, so it can't vanish before it is read.
 */
const FADE_DURATION = 200;

// Same 24px grid and 2px round stroke as the sidebar icons.
const TOAST_ICON_PATHS = {
  success: "M5 12.5l4.5 4.5L19 7.5",
  warning: "M12 7v6M12 17h.01",
  error: "M7 7l10 10M17 7 7 17",
  info: "M12 11v6M12 7h.01",
};

const ASSERTIVE_TYPES = new Set(["error", "warning"]);

/*
 * White card, navy text, and a coloured accent bar plus icon carrying the
 * status. Colour is never the only signal: each type also has its own icon.
 * Pinned top-centre. Only an error toast takes clicks (its close button), so
 * the others never block the table beneath them. The centring uses
 * `transform` (not `translate`) because the enter / exit keyframes animate
 * `transform` and keep the -50% offset.
 */
const TOAST_CLASS = [
  "fixed top-4 left-1/2 z-[3000] flex w-max items-center gap-2.5",
  "max-w-[min(400px,calc(100vw-32px))] overflow-hidden py-2 pr-2 pl-3.5",
  "rounded-ui border border-rl-border bg-white text-[0.8125rem] leading-[1.35]",
  "font-semibold [overflow-wrap:anywhere] text-rl-text [transform:translateX(-50%)]",
  "shadow-popup",
  "before:absolute before:inset-y-0 before:left-0 before:w-[3px]",
  "before:bg-(--toast-accent) before:content-['']",
].join(" ");

const TOAST_ACCENTS = {
  success: "[--toast-accent:var(--color-rl-success)]",
  warning: "[--toast-accent:var(--color-rl-warning)]",
  error: "[--toast-accent:var(--color-rl-danger)]",
  info: "[--toast-accent:var(--color-rl-cell-ring)]",
};

function Toast({ message, type, isVisible, onClose }: ToastProps) {
  const duration = uiConfig.toastDuration[type] ?? uiConfig.toastDuration.info;
  const staysOpen = type === "error";
  const [isFadingOut, setIsFadingOut] = useState(false);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!isVisible || staysOpen) {
      return undefined;
    }

    setIsFadingOut(false);

    const fadeTimer = window.setTimeout(
      () => setIsFadingOut(true),
      Math.max(duration - FADE_DURATION, 0),
    );
    const closeTimer = window.setTimeout(() => onCloseRef.current(), duration);

    return () => {
      window.clearTimeout(fadeTimer);
      window.clearTimeout(closeTimer);
    };
  }, [duration, isVisible, staysOpen]);

  if (!isVisible) {
    return null;
  }

  const isAssertive = ASSERTIVE_TYPES.has(type);

  return (
    <div
      className={`${TOAST_CLASS} ${staysOpen ? "pointer-events-auto" : "pointer-events-none pr-3.5"} ${
        TOAST_ACCENTS[type] ?? TOAST_ACCENTS.info
      } ${isFadingOut ? "animate-toast-out" : "animate-toast-in"}`}
      role={isAssertive ? "alert" : "status"}
      aria-live={isAssertive ? "assertive" : "polite"}
      aria-atomic="true"
    >
      <svg
        className="size-4 flex-none text-(--toast-accent)"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d={TOAST_ICON_PATHS[type] ?? TOAST_ICON_PATHS.info} />
      </svg>
      <span>{message}</span>
      {staysOpen && (
        <button
          type="button"
          className="grid size-7 flex-none cursor-pointer place-items-center rounded-ui border-0 bg-transparent text-rl-text-muted hover:bg-rl-navy-soft hover:text-rl-navy focus-visible:outline-2 focus-visible:outline-rl-cell-ring"
          aria-label="Close message"
          onClick={() => onCloseRef.current()}
        >
          <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <path d="m7 7 10 10M17 7 7 17" />
          </svg>
        </button>
      )}
    </div>
  );
}

export default Toast;
