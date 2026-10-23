import type { Drillhole } from "../../types/domain";
import DatabaseViewerTable from "./DatabaseViewerTable";
import { databaseViewerConfig } from "./config";
import {
  dataViewerScroll,
  loadDataViewerRecords,
  useDataViewerState,
} from "./databaseViewerStore";
import { useToast } from "../../hooks/useToast";
import Toast from "../../components/Toast";
// The Raw Litho drillhole selector and list, reused as they are.
import RawLithoFilters from "../RawLitho/RawLithoFilters";
import { useDrillholes } from "../RawLitho/hooks/useDrillholes";
import { OUTLINE_BUTTON, OUTLINE_BUTTON_NAVY } from "../RawLitho/rawLithoStyles";

const { title } = databaseViewerConfig;
const numberFormat = new Intl.NumberFormat("en-US");

const EMPTY_MESSAGES = {
  idle: "Select a drillhole to view its records.",
  loading: "Loading records…",
  loaded: "No records are stored for this drillhole.",
  error: "Unable to load the records.",
} as const;

/*
 * Read-only view of the records stored for one drillhole (GET /api/dataviewer,
 * filtered by HOLEID), with its Project and Campaign, laid out like the Raw
 * Litho table. Nothing is edited or written. The state lives in
 * databaseViewerStore, so leaving the page and coming back keeps the
 * drillhole, records and scroll position without a new request.
 */
function DatabaseViewer() {
  const { toast, showToast, hideToast } = useToast();
  const { drillholes, isLoading, error } = useDrillholes(showToast);
  const { holeId, view } = useDataViewerState();

  function loadRecords(nextHoleId: string) {
    loadDataViewerRecords(nextHoleId).then((outcome) => {
      if (outcome === "error")
        showToast({ type: "error", message: "Unable to load drillhole records" });
    });
  }

  const loaded = view.status === "loaded" ? view : null;
  // Project and Campaign as the Data Viewer API resolved them.
  const shownDrillhole: Drillhole | null = loaded
    ? {
        holeId: loaded.data.drillhole,
        projectCode: loaded.data.project ?? "",
        campaign: loaded.data.campaign ?? "",
      }
    : null;

  let recordStatus = "No drillhole selected";
  if (view.status === "loading") recordStatus = "Loading records…";
  else if (view.status === "error") recordStatus = "Records unavailable";
  else if (loaded)
    recordStatus = `${numberFormat.format(loaded.table.rows.length)} intervals · ${numberFormat.format(loaded.data.totalRecords)} stored values`;

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

      <div className="mb-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1">
        <h2 className="m-0 text-[0.85rem] font-semibold text-rl-text">
          Database Records
        </h2>
        <p className="m-0 text-[0.8rem] text-rl-text-muted" aria-live="polite">
          {recordStatus}
        </p>
        {loaded && loaded.table.storedBy.length > 0 && (
          <p className="m-0 text-[0.8rem] text-rl-text-muted">
            Stored by {loaded.table.storedBy.join(", ")}
            {loaded.table.fileNames.length > 0 &&
              ` · File ${loaded.table.fileNames.join(", ")}`}
          </p>
        )}
        {loaded && loaded.table.hiddenValues > 0 && (
          <p className="m-0 text-[0.8rem] text-[#7a4b00]" role="note">
            {numberFormat.format(loaded.table.hiddenValues)} stored values have no
            Raw Litho column and are not shown
          </p>
        )}
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
        rows={loaded?.table.rows ?? []}
        emptyMessage={EMPTY_MESSAGES[view.status]}
        initialScrollTop={dataViewerScroll.get()}
        onScroll={dataViewerScroll.set}
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
