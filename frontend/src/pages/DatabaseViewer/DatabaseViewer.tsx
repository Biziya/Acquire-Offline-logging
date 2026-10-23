import type { Drillhole } from "../../types/domain";
import { isAbortError } from "../../types/validation";
import { useEffect, useRef, useState } from "react";
import DatabaseViewerTable from "./DatabaseViewerTable";
import { databaseViewerConfig } from "./config";
import type { DataViewerResponse } from "./databaseViewerTypes";
import { getDataViewerRecords } from "../../services/Api/dataViewerApi";
import { useToast } from "../../hooks/useToast";
import Toast from "../../components/Toast";
// The Raw Litho drillhole selector and list, reused as they are.
import RawLithoFilters from "../RawLitho/RawLithoFilters";
import { useDrillholes } from "../RawLitho/hooks/useDrillholes";
import { OUTLINE_BUTTON, OUTLINE_BUTTON_NAVY } from "../RawLitho/rawLithoStyles";

const { title } = databaseViewerConfig;
const numberFormat = new Intl.NumberFormat("en-US");

type View =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "loaded"; data: DataViewerResponse }
  | { status: "error" };

const EMPTY_MESSAGES = {
  idle: "Select a drillhole to view its records.",
  loading: "Loading records…",
  loaded: "No records are stored for this drillhole.",
  error: "Unable to load the records.",
} as const;

/*
 * Read-only view of the records stored for one drillhole (GET /api/dataviewer,
 * filtered by HOLEID), with its Project and Campaign. Nothing is edited or
 * written. Choosing another drillhole aborts the previous request, so an
 * older, slower answer can never replace the current one.
 */
function DatabaseViewer() {
  const { toast, showToast, hideToast } = useToast();
  const { drillholes, isLoading, error } = useDrillholes(showToast);
  const [holeId, setHoleId] = useState("");
  const [view, setView] = useState<View>({ status: "idle" });
  const requestRef = useRef<AbortController | null>(null);

  // Leaving the page cancels a request still in flight.
  useEffect(() => () => requestRef.current?.abort(), []);

  function loadRecords(nextHoleId: string) {
    requestRef.current?.abort();
    requestRef.current = null;
    setHoleId(nextHoleId);

    if (!nextHoleId) {
      setView({ status: "idle" });
      return;
    }

    const request = new AbortController();
    requestRef.current = request;
    setView({ status: "loading" });

    getDataViewerRecords(nextHoleId, request.signal).then(
      (data) => {
        if (requestRef.current === request) setView({ status: "loaded", data });
      },
      (loadError) => {
        if (requestRef.current !== request || isAbortError(loadError)) return;

        console.error("Unable to load Data Viewer records.", loadError);
        setView({ status: "error" });
        showToast({ type: "error", message: "Unable to load drillhole records" });
      },
    );
  }

  const data = view.status === "loaded" ? view.data : null;
  // Project and Campaign as the Data Viewer API resolved them.
  const shownDrillhole: Drillhole | null = data
    ? {
        holeId: data.drillhole,
        projectCode: data.project ?? "",
        campaign: data.campaign ?? "",
      }
    : null;

  let recordStatus = "No drillhole selected";
  if (view.status === "loading") recordStatus = "Loading records…";
  else if (view.status === "error") recordStatus = "Records unavailable";
  else if (data) recordStatus = `${numberFormat.format(data.totalRecords)} records`;

  return (
    <section className="flex min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden">
      <h1 className="m-0 mb-1.5 text-[1.3rem] font-[650] tracking-[-0.01em] text-rl-navy">
        {title}
      </h1>

      <RawLithoFilters
        drillholes={drillholes}
        selectedHoleId={holeId}
        selectedDrillhole={shownDrillhole}
        isLoading={isLoading}
        error={error}
        onDrillholeChange={loadRecords}
      />

      <div className="mb-1.5 flex flex-wrap items-center gap-2.5">
        <h2 className="m-0 text-[0.85rem] font-semibold text-rl-text">
          Database Records
        </h2>
        <p className="m-0 text-[0.8rem] text-rl-text-muted" aria-live="polite">
          {recordStatus}
        </p>
        {view.status === "error" && (
          <button
            className={`${OUTLINE_BUTTON} ${OUTLINE_BUTTON_NAVY} h-[26px] px-2.5 text-[0.8rem]`}
            type="button"
            onClick={() => loadRecords(holeId)}
          >
            Retry
          </button>
        )}
      </div>

      <DatabaseViewerTable
        // A new drillhole starts at the top of its records.
        key={holeId}
        records={data?.records ?? []}
        emptyMessage={EMPTY_MESSAGES[view.status]}
      />

      {toast && (
        <Toast
          key={toast.id}
          message={toast.message}
          type={toast.type}
          isVisible
          onClose={() => hideToast(toast.id)}
        />
      )}
    </section>
  );
}

export default DatabaseViewer;
