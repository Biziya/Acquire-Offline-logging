import { useEffect, useRef } from "react";

interface ShortcutsOptions {
  isEnabled: boolean;
  isBlocked: boolean;
  canRemoveLastRow: boolean;
  onRemoveLastRow: () => void;
  onAddRow: () => void;
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}


const PAGINATION_KEYS = new Set(["PageUp", "PageDown"]);

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

function changePage(
  key: string,
  { currentPage, totalPages, onPageChange }: ShortcutsOptions,
) {
  const nextPage = key === "PageUp" ? currentPage - 1 : currentPage + 1;

  // First page + PageUp and last page + PageDown do nothing.
  if (nextPage < 1 || nextPage > totalPages) return;

  onPageChange(nextPage);
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

  if (!PAGINATION_KEYS.has(event.key)) return;

  event.preventDefault();
  changePage(event.key, options);
}

/*
 * Raw Litho keyboard shortcuts.
 *
 *   F4        Add Row      (same validation path as the button)
 *   F5        Remove Last Row, and never a browser refresh
 *   PageUp    previous table page
 *   PageDown  next table page
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
