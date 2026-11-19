import { useCallback, useMemo, useState } from "react";
import PageTitle from "../../components/PageTitle";
import Toast from "../../components/Toast";
import { useToast } from "../../hooks/useToast";
import RawLithoFilters from "../RawLitho/RawLithoFilters";
import { useDrillholes } from "../RawLitho/hooks/useDrillholes";
import { orderDrillholes } from "../RawLitho/drillholeOrdering";
import RawExtractionTable from "./RawExtractionTable";
import { rawExtractionConfig } from "./config";
import type { RawExtractionField, RawExtractionRow } from "./rawExtractionColumns";
import { createSampleRows } from "./rawExtractionSampleRows";

const NO_SELECTION_MESSAGE = "Select a drillhole to view its core runs.";

/*
 * Raw Extraction: core runs of one drillhole. The drillhole selector is Raw
 * Litho's (same list, cache and recent drillholes). The table holds sample
 * rows for now: edits stay in memory, and choosing a drillhole (or reloading)
 * brings the sample back. Nothing is read from or written to the database.
 */
function RawExtraction() {
  const { toast, showToast, hideToast } = useToast();
  const { drillholes, recentHoleIds, isLoading, error, rememberDrillholeSelection } =
    useDrillholes(showToast);
  const [selectedHoleId, setSelectedHoleId] = useState("");
  const [rows, setRows] = useState<RawExtractionRow[]>([]);

  const selectorList = useMemo(
    () => orderDrillholes(drillholes, recentHoleIds),
    [drillholes, recentHoleIds],
  );

  const selectedDrillhole = useMemo(
    () => drillholes.find((drillhole) => drillhole.holeId === selectedHoleId) ?? null,
    [drillholes, selectedHoleId],
  );

  const handleDrillholeChange = useCallback(
    (holeId: string) => {
      setSelectedHoleId(holeId);
      setRows(holeId ? createSampleRows() : []);
      if (holeId) rememberDrillholeSelection(holeId);
    },
    [rememberDrillholeSelection],
  );

  const handleCellChange = useCallback(
    (rowId: number, field: RawExtractionField, value: string) => {
      setRows((current) =>
        current.map((row) => (row.id === rowId ? { ...row, [field]: value } : row)),
      );
    },
    [],
  );

  return (
    <section className="flex min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden">
      {toast && (
        <Toast
          key={toast.id}
          message={toast.message}
          type={toast.type}
          action={toast.action}
          onClose={() => hideToast(toast.id)}
        />
      )}

      <PageTitle>{rawExtractionConfig.title}</PageTitle>

      <RawLithoFilters
        drillholes={selectorList.drillholes}
        recentCount={selectorList.recentCount}
        selectedHoleId={selectedHoleId}
        selectedDrillhole={selectedDrillhole}
        isLoading={isLoading}
        error={error}
        onDrillholeChange={handleDrillholeChange}
      />

      <RawExtractionTable
        rows={rows}
        emptyMessage={NO_SELECTION_MESSAGE}
        onCellChange={handleCellChange}
      />
    </section>
  );
}

export default RawExtraction;
