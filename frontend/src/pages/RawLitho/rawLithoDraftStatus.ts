import { useSyncExternalStore } from "react";
import {
  isRawLithoDatabaseOutdated,
  subscribeRawLithoDatabaseOutdated,
} from "../../services/IndexDB/rawLithoDatabase";

/*
 * What the Raw Litho page must tell the logger about its draft storage.
 *
 * `useRawLithoDraftPersistence` publishes here, and the banner inside the
 * table reads it, so the status reaches the screen without threading props
 * through the page component.
 */
export interface RawLithoDraftStatus {
  /* The last write to IndexedDB failed; edits live only in this tab's memory. */
  saveError: boolean;
  /* Another tab or window holds this drillhole, so this one is read-only. */
  openElsewhere: boolean;
}

const IDLE: RawLithoDraftStatus = { saveError: false, openElsewhere: false };
let current = IDLE;
const listeners = new Set<() => void>();

export function publishRawLithoDraftStatus(next: RawLithoDraftStatus) {
  if (
    next.saveError === current.saveError &&
    next.openElsewhere === current.openElsewhere
  )
    return;
  current = next.saveError || next.openElsewhere ? next : IDLE;
  listeners.forEach((listener) => listener());
}

export function resetRawLithoDraftStatus() {
  publishRawLithoDraftStatus(IDLE);
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useRawLithoDraftStatus() {
  const status = useSyncExternalStore(subscribe, () => current);
  const databaseOutdated = useSyncExternalStore(
    subscribeRawLithoDatabaseOutdated,
    isRawLithoDatabaseOutdated,
  );
  return { ...status, databaseOutdated };
}
