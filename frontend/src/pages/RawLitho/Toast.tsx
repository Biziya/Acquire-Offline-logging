import type { ToastNotification } from "../../types/domain";
import { useEffect, useRef, useState } from "react";
import "./Toast.css";

interface ToastProps {
  message: string;
  type: ToastNotification["type"];
  isVisible: boolean;
  duration: number;
  onClose: () => void;
}



const FADE_DURATION = 200;

const TOAST_ICONS = {
  success: "✓",
  warning: "!",
  error: "✕",
  info: "i",
};

const ASSERTIVE_TYPES = new Set(["error", "warning"]);

function Toast({ message, type, isVisible, duration, onClose }: ToastProps) {
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
      className={`toast toast--${type}${isFadingOut ? " toast--fade-out" : ""}`}
      role={isAssertive ? "alert" : "status"}
      aria-live={isAssertive ? "assertive" : "polite"}
      aria-atomic="true"
    >
      <span className="toast__icon" aria-hidden="true">
        {TOAST_ICONS[type] ?? TOAST_ICONS.info}
      </span>
      <span className="toast__message">{message}</span>
    </div>
  );
}

export default Toast;
