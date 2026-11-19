import { useEffect, useRef } from "react";

interface ShortcutsOptions {
  isEnabled: boolean;
  isBlocked: boolean;
  canRemoveLastRow: boolean;
  onRemoveLastRow: () => void;
  onAddRow: () => void;
  /* PageUp / PageDown: move the caret one screen of rows up (-1) or down (1). */
  onScreenMove: (direction: -1 | 1) => void;
}


const SCREEN_KEYS = new Set(["PageUp", "PageDown"]);

function hasModifier(event: KeyboardEvent) {
  return event.altKey || event.ctrlKey || event.metaKey || event.shiftKey;
}

function removeLastRow({
  isEnabled,
  isBlocked,
  canRemoveLastRow,
  onRemoveLastRow,
}: ShortcutsOptions) {
  if (isBlocked || !isEnabled || !canRemoveLastRow) return;

  onRemoveLastRow();
}

function handleShortcut(event: KeyboardEvent, options: ShortcutsOptions) {
  if (hasModifier(event)) return;

  /*
   * F5 is swallowed for as long as the page is mounted, so a stray refresh can
   * never discard edits that are still inside the auto-save debounce window.
   */
  if (event.key === "F5") {
    event.preventDefault();
    removeLastRow(options);
    return;
  }

  if (options.isBlocked || !options.isEnabled) return;

  if (event.key === "F4") {
    event.preventDefault();
    options.onAddRow();
    return;
  }

  if (!SCREEN_KEYS.has(event.key)) return;

  event.preventDefault();
  options.onScreenMove(event.key === "PageUp" ? -1 : 1);
}

/*
 * Raw Litho keyboard shortcuts.
 *
 *   F4        Add Row      (same validation path as the button)
 *   F5        Delete the last row (selects it and asks first), and never a
 *             browser refresh
 *   PageUp    caret one screen of rows up (same column)
 *   PageDown  caret one screen of rows down
 *
 * The listener is attached on mount and removed on unmount, so the shortcuts
 * only exist while Raw Litho is the active route. Options are read through a
 * ref so the listener is registered exactly once instead of being torn down on
 * every render.
 */
export function useRawLithoShortcuts(options: ShortcutsOptions) {
  const optionsRef = useRef(options);

  optionsRef.current = options;

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      handleShortcut(event, optionsRef.current);
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);
}
