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
 * Durations come from config/ui.yaml by type (error 5 s, warning and
 * success 3 s).
 */
const FADE_DURATION = 200;

const TOAST_ICONS = {
  success: "✓",
  warning: "!",
  error: "✕",
  info: "i",
};

const ASSERTIVE_TYPES = new Set(["error", "warning"]);

/*
 * White card, navy text, and a coloured accent bar plus icon carrying the
 * status. Colour is never the only signal: each type also has its own glyph.
 * Pinned top-centre, it never intercepts clicks on the table beneath it. The
 * centring uses `transform` (not `translate`) because the enter / exit
 * keyframes animate `transform` and keep the -50% offset.
 */
const TOAST_CLASS = [
  "pointer-events-none fixed top-4 left-1/2 z-[3000] flex w-max items-center gap-2.5",
  "max-w-[min(360px,calc(100vw-32px))] overflow-hidden py-[9px] pr-3.5 pl-3",
  "rounded-[10px] border border-rl-border bg-white text-[0.82rem] leading-[1.3]",
  "font-[550] [overflow-wrap:anywhere] text-rl-text [transform:translateX(-50%)]",
  "shadow-[0_1px_2px_rgb(16_35_61/8%),0_10px_28px_rgb(16_35_61/16%)]",
  "before:absolute before:inset-y-0 before:left-0 before:w-[3px]",
  "before:bg-(--toast-accent) before:content-['']",
].join(" ");

const TOAST_ACCENTS = {
  success: "[--toast-accent:#1e7a54]",
  warning: "[--toast-accent:#b7791f]",
  error: "[--toast-accent:var(--color-rl-danger)]",
  info: "[--toast-accent:var(--color-rl-cell-ring)]",
};

function Toast({ message, type, isVisible, onClose }: ToastProps) {
  const duration = uiConfig.toastDuration[type] ?? uiConfig.toastDuration.info;
  const [isFadingOut, setIsFadingOut] = useState(false);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!isVisible) {
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
  }, [duration, isVisible]);

  if (!isVisible) {
    return null;
  }

  const isAssertive = ASSERTIVE_TYPES.has(type);

  return (
    <div
      className={`${TOAST_CLASS} ${TOAST_ACCENTS[type] ?? TOAST_ACCENTS.info} ${
        isFadingOut ? "animate-toast-out" : "animate-toast-in"
      }`}
      role={isAssertive ? "alert" : "status"}
      aria-live={isAssertive ? "assertive" : "polite"}
      aria-atomic="true"
    >
      <span
        className="inline-flex size-[17px] flex-none items-center justify-center rounded-full bg-(--toast-accent) text-[0.66rem] leading-none font-bold text-white"
        aria-hidden="true"
      >
        {TOAST_ICONS[type] ?? TOAST_ICONS.info}
      </span>
      <span>{message}</span>
    </div>
  );
}

export default Toast;
