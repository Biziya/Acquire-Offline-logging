import { useEffect, useState } from "react";

/*
 * One tab at a time edits a drillhole.
 *
 * Each tab asks the browser for an exclusive Web Lock named after the
 * drillhole and keeps it until it selects another hole or closes. A tab that
 * does not get it within a moment is told another tab has it, stays
 * read-only, and keeps waiting in the queue: when the other tab lets go, it
 * is promoted to editor.
 *
 * - "pending": the browser has not granted it yet; do not allow edits.
 * - "held": this tab is the editor.
 * - "elsewhere": another tab or window is editing this drillhole.
 *
 * Without the Web Locks API (old browsers) the tab is always the editor.
 */
export type TabLockState = "pending" | "held" | "elsewhere";

export const DRILLHOLE_LOCK_PREFIX = "raw-litho-drillhole:";
/*
 * A free lock is granted within milliseconds. The grace period also covers
 * this tab's own previous holder letting go (a remount, a quick switch back).
 */
export const LOCK_GRACE_MS = 300;

function getLocks(): LockManager | undefined {
  return typeof navigator !== "undefined" ? navigator.locks : undefined;
}

export function useDrillholeTabLock(key: string | null): TabLockState {
  const [state, setState] = useState<{ key: string; state: TabLockState } | null>(
    null,
  );

  useEffect(() => {
    const locks = getLocks();
    if (!key || !locks) return;

    let active = true;
    let release = () => {};
    const released = new Promise<void>((resolve) => {
      release = resolve;
    });
    const controller = new AbortController();
    const set = (next: TabLockState) => {
      if (active) setState({ key, state: next });
    };
    const grace = setTimeout(() => set("elsewhere"), LOCK_GRACE_MS);

    locks
      .request(DRILLHOLE_LOCK_PREFIX + key, { signal: controller.signal }, () => {
        clearTimeout(grace);
        if (!active) return undefined;
        set("held");
        // Held until this effect is cleaned up.
        return released;
      })
      .catch((error: unknown) => {
        clearTimeout(grace);
        if (!active || (error instanceof DOMException && error.name === "AbortError"))
          return;
        // Failing closed would lock the logger out of their own work.
        console.error("Unable to take the drillhole tab lock.", error);
        set("held");
      });

    return () => {
      active = false;
      clearTimeout(grace);
      controller.abort();
      release();
    };
  }, [key]);

  if (!key || !getLocks()) return "held";
  return state?.key === key ? state.state : "pending";
}
