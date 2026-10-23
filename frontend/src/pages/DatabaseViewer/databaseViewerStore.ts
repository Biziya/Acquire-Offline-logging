import { useSyncExternalStore } from "react";
import { isAbortError } from "../../types/validation";
import { getDataViewerRecords } from "../../services/Api/dataViewerApi";
import type { DataViewerResponse } from "./databaseViewerTypes";
import { buildDataViewerTable, type DataViewerTable } from "./databaseViewerRows";

export type DataViewerView =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "loaded"; data: DataViewerResponse; table: DataViewerTable }
  | { status: "error" };

export interface DataViewerState {
  holeId: string;
  view: DataViewerView;
}

/*
 * The Database Viewer's state for the whole browser session, kept outside
 * the page: React Router unmounts a page when you navigate away, so state
 * inside it would be lost. Returning shows the same drillhole, records and
 * scroll position without a new request. A request still running when the
 * page is left completes into this store. Nothing is written to browser
 * storage; a reload starts empty. Independent of Raw Litho's state.
 */
let state: DataViewerState = { holeId: "", view: { status: "idle" } };
let request: AbortController | null = null;
const listeners = new Set<() => void>();

/* Not part of `state`: saving it on every scroll event must not re-render. */
let scrollTop = 0;

function setState(next: DataViewerState) {
  state = next;
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useDataViewerState() {
  return useSyncExternalStore(subscribe, () => state);
}

export const dataViewerScroll = {
  get: () => scrollTop,
  set: (value: number) => {
    scrollTop = value;
  },
};

/*
 * Shows `holeId` ("" clears the page). A newer call aborts the older request,
 * so an earlier, slower answer can never replace the current selection.
 * Resolves "error" only for the request that is still current.
 */
export async function loadDataViewerRecords(holeId: string): Promise<"loaded" | "error" | "superseded"> {
  request?.abort();
  request = null;
  scrollTop = 0;

  if (!holeId) {
    setState({ holeId: "", view: { status: "idle" } });
    return "loaded";
  }

  const current = new AbortController();
  request = current;
  setState({ holeId, view: { status: "loading" } });

  try {
    const data = await getDataViewerRecords(holeId, current.signal);
    if (request !== current) return "superseded";

    setState({ holeId, view: { status: "loaded", data, table: buildDataViewerTable(data.records) } });
    return "loaded";
  } catch (error) {
    if (request !== current || isAbortError(error)) return "superseded";

    console.error("Unable to load Data Viewer records.", error);
    setState({ holeId, view: { status: "error" } });
    return "error";
  } finally {
    if (request === current) request = null;
  }
}

/* Tests only: back to an empty page. */
export function resetDataViewerState() {
  request?.abort();
  request = null;
  scrollTop = 0;
  setState({ holeId: "", view: { status: "idle" } });
}
