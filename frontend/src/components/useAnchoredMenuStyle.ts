import { useLayoutEffect, useState } from "react";

/*
 * Fixed-position style that keeps a portalled menu just below its anchor
 * input while the window resizes or any ancestor scrolls. Returns {} while
 * the menu is closed. `getAnchor` returning null (the anchor scrolled out of
 * a virtualised table) calls `onAnchorLost`.
 */
export function useAnchoredMenuStyle(
  isOpen: boolean,
  getAnchor: () => HTMLElement | null,
  onAnchorLost?: () => void,
) {
  const [style, setStyle] = useState<React.CSSProperties>({});

  useLayoutEffect(() => {
    if (!isOpen) return undefined;

    function positionMenu() {
      const anchor = getAnchor();
      if (!anchor?.isConnected) {
        onAnchorLost?.();
        return;
      }

      const rect = anchor.getBoundingClientRect();
      setStyle({
        top: rect.bottom + 2,
        left: rect.left,
        width: Math.max(rect.width, 150),
      });
    }

    positionMenu();
    window.addEventListener("resize", positionMenu);
    window.addEventListener("scroll", positionMenu, true);

    return () => {
      window.removeEventListener("resize", positionMenu);
      window.removeEventListener("scroll", positionMenu, true);
    };
    // Re-run only when opening or the anchor changes, not on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, getAnchor]);

  return style;
}
