import { useCallback, useEffect, useId, useRef, useState } from "react";
import { PRIMARY_BUTTON } from "../uiStyles";
import { greetingConfig, type GreetingConfig } from "./config";
import { greetingYear, isInWindow } from "./greetingDates";

const STORAGE_PREFIX = "newYearGreetingSeen-";
const SNOWFLAKES = 30;

function hasSeen(key: string) {
  try {
    return localStorage.getItem(key) !== null;
  } catch {
    return false;
  }
}

function markSeen(key: string) {
  try {
    localStorage.setItem(key, new Date().toISOString());
  } catch {
    // Storage blocked: the greeting may show again, which is harmless.
  }
}

// Fixed positions and timings, so renders stay stable.
const flakes = Array.from({ length: SNOWFLAKES }, (_, index) => ({
  left: `${(index * 37) % 100}%`,
  delay: `${(index * 0.13) % 2.4}s`,
  size: 4 + (index % 4) * 2,
}));

/*
 * New Year greeting from the Data team, shown once per user per season
 * during the dates in config.yaml.
 */
function NewYearGreeting({ config = greetingConfig }: { config?: GreetingConfig }) {
  const id = useId();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [today] = useState(() => new Date());
  const year = greetingYear(today);
  const storageKey = `${STORAGE_PREFIX}${year}`;
  const [isOpen, setIsOpen] = useState(
    () => isInWindow(today, config.start, config.end) && !hasSeen(storageKey),
  );

  const close = useCallback(() => {
    markSeen(storageKey);
    setIsOpen(false);
  }, [storageKey]);

  useEffect(() => {
    if (!isOpen) return;
    const previouslyFocused = document.activeElement;
    buttonRef.current?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      close();
    }

    document.addEventListener("keydown", handleKeyDown, true);
    return () => {
      document.removeEventListener("keydown", handleKeyDown, true);
      if (previouslyFocused instanceof HTMLElement && previouslyFocused.isConnected)
        previouslyFocused.focus();
    };
  }, [isOpen, close]);

  if (!isOpen) return null;

  const fill = (text: string) => text.replaceAll("{year}", String(year));

  return (
    <div
      className="fixed inset-0 z-[2000] flex animate-backdrop-in items-center justify-center overflow-hidden bg-rl-navy-darker/45 p-4"
      role="presentation"
      onClick={(event) => {
        if (event.target === event.currentTarget) close();
      }}
    >
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 motion-reduce:hidden">
        {flakes.map((flake, index) => (
          <span
            key={index}
            className="absolute -top-3 animate-snow-fall rounded-full bg-white opacity-0"
            style={{
              left: flake.left,
              width: flake.size,
              height: flake.size,
              animationDelay: flake.delay,
            }}
          />
        ))}
      </div>

      <div
        className="relative w-[min(540px,100%)] animate-dialog-in overflow-hidden rounded-ui border border-rl-border bg-white shadow-popup"
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${id}-title`}
      >
        <div className="px-5 pt-5 pb-4 text-rl-text">
          <h2 className="m-0 text-[1.125rem] leading-snug font-bold" id={`${id}-title`}>
            <span aria-hidden="true">🎉 </span>
            {fill(config.title.mn)}
          </h2>
          <p className="mt-0.5 mb-0 text-[0.875rem] font-semibold text-rl-text-muted">
            {fill(config.title.en)}
          </p>

          <p className="mt-3 mb-0 text-[0.875rem] leading-relaxed whitespace-pre-line">
            {fill(config.message.mn)}
          </p>
          <p className="mt-2 mb-0 text-[0.8125rem] leading-normal text-rl-text-muted">
            {fill(config.message.en)}
          </p>

          <p className="mt-3 mb-0 text-right text-[0.875rem] font-semibold">
            {config.signature}
          </p>
        </div>

        <div className="flex justify-end border-t border-rl-border bg-rl-navy-softer px-5 py-3">
          <button ref={buttonRef} className={PRIMARY_BUTTON} type="button" onClick={close}>
            {config.button}
          </button>
        </div>
      </div>
    </div>
  );
}

export default NewYearGreeting;
