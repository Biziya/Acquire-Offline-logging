import { useCallback, useMemo, useState } from "react";
import ConfirmDialog from "./ConfirmDialog";
import RawLithoFilters from "./RawLithoFilters";
import RawLithoTable from "./RawLithoTable";
import Toast from "./Toast";
import { TOAST_NOTIFICATIONS } from "./constants";
import { useDrillholes } from "./hooks/useDrillholes";
import { useRawLithoImport } from "./hooks/useRawLithoImport";
import { useRawLithoLookups } from "./hooks/useRawLithoLookups";
import { useRawLithoWorkspace } from "./hooks/useRawLithoWorkspace";
import { useRemoveRowConfirmation } from "./hooks/useRemoveRowConfirmation";
import { useToast } from "./hooks/useToast";
import { buildImportConfirmationMessage } from "./rawLithoImportService";
import {
  exportRawLithoSnapshot,
  touchRawLithoDocument,
} from "./rawLithoHelpers";
import { hasInvalidLookupValues } from "./rawLithoValidation";
import "./RawLitho.css";

function RawLitho() {
  const { toast, showToast, hideToast } = useToast();
  const { drillholes, isLoading, error, rememberDrillholeSelection } =
    useDrillholes(showToast);
  const { lookupData, lookupStatus } = useRawLithoLookups();
  const workspace = useRawLithoWorkspace({ drillholes, showToast });
  const [isSaving, setIsSaving] = useState(false);

  const {
    selectedHoleId,
    rawLithoDocument,
    rows,
    currentPage,
    totalPages,
    isPageEnabled,
    selectDrillhole,
  } = workspace;

  /*
   * Selecting a drillhole both loads its draft and moves the hole to the front
   * of the selector's recent list. Clearing the field (holeId "") is not a
   * selection, so it is not remembered.
   */
  const handleDrillholeChange = useCallback(
    (holeId: string) => {
      selectDrillhole(holeId);

      if (holeId) rememberDrillholeSelection(holeId);
    },
    [rememberDrillholeSelection, selectDrillhole],
  );

  const importer = useRawLithoImport({
    lookupData,
    selectionKey: selectedHoleId,
    showToast,
    onImported: workspace.applyImportedDocument,
  });

  const removal = useRemoveRowConfirmation({
    onRemoveLastRow: workspace.removeLastRow,
    showToast,
  });

  const selectedDrillhole = useMemo(() => {
    if (!selectedHoleId) return null;

    const record =
      drillholes.find((drillhole) => drillhole.holeId === selectedHoleId) ??
      null;
    const documentIsActive = rawLithoDocument.drillhole === selectedHoleId;

    return {
      holeId: selectedHoleId,
      projectCode: documentIsActive
        ? rawLithoDocument.project
        : (record?.projectCode ?? ""),
      campaign: documentIsActive
        ? rawLithoDocument.campaign
        : (record?.campaign ?? ""),
    };
  }, [drillholes, rawLithoDocument, selectedHoleId]);

  const handleSave = useCallback(async () => {
    if (!isPageEnabled || isSaving) return;

    if (hasInvalidLookupValues(rows, lookupData)) {
      showToast(TOAST_NOTIFICATIONS.invalidLookupValue);
      return;
    }

    setIsSaving(true);

    const snapshot = touchRawLithoDocument(rawLithoDocument);
    workspace.setRawLithoDocument(snapshot);
    let saveSucceeded: boolean;

    try {
      saveSucceeded = await workspace.flushPendingSaves();
    } catch (saveError) {
      saveSucceeded = false;
      console.error("Unable to save the Raw Litho draft.", saveError);
    }

    try {
      exportRawLithoSnapshot(snapshot);
    } catch (exportError) {
      saveSucceeded = false;
      console.error("Unable to export the Raw Litho JSON file.", exportError);
    }

    setIsSaving(false);
    showToast(
      saveSucceeded
        ? TOAST_NOTIFICATIONS.saveSuccess
        : TOAST_NOTIFICATIONS.saveFailed,
    );
  }, [
    isPageEnabled,
    isSaving,
    lookupData,
    rawLithoDocument,
    rows,
    showToast,
    workspace,
  ]);

  const canImport = !selectedHoleId;

  return (
    <section className="raw-litho-page">
      {toast && (
        <Toast
          key={toast.id}
          message={toast.message}
          type={toast.type}
          isVisible
          duration={toast.duration}
          onClose={() => hideToast(toast.id)}
        />
      )}

      {importer.pendingImport && (
        <ConfirmDialog
          title="Import this JSON file?"
          message={buildImportConfirmationMessage(importer.pendingImport)}
          details="Cancel leaves the data stored on this device exactly as it is."
          confirmLabel="Import"
          cancelLabel="Cancel"
          busyLabel="Importing…"
          isBusy={importer.isImporting}
          initialFocus="confirm"
          onConfirm={importer.confirmImport}
          onCancel={importer.cancelImport}
        />
      )}

      {removal.isConfirmOpen && (
        <ConfirmDialog
          title="Remove last row?"
          message="This row will be deleted."
          confirmLabel="Remove"
          cancelLabel="Cancel"
          busyLabel="Removing…"
          isBusy={removal.isRemoving}
          onConfirm={removal.confirmRemoveLastRow}
          onCancel={removal.cancelRemoveLastRow}
        />
      )}

      <div className="raw-litho-header">
        <h1 className="raw-litho-title">Raw Litho</h1>

        <button
          className="raw-litho-import-button"
          type="button"
          onClick={importer.openFilePicker}
          disabled={!canImport}
        >
          Import JSON
        </button>

        <input
          ref={importer.fileInputRef}
          className="raw-litho-file-input"
          type="file"
          accept=".json,application/json"
          onChange={importer.selectFile}
          disabled={!canImport}
        />
      </div>

      <RawLithoFilters
        drillholes={drillholes}
        selectedHoleId={selectedHoleId}
        selectedDrillhole={selectedDrillhole}
        isLoading={isLoading}
        error={error}
        onDrillholeChange={handleDrillholeChange}
      />

      <RawLithoTable
        rows={rows}
        currentPage={currentPage}
        totalPages={totalPages}
        onPageChange={workspace.changeTablePage}
        lookupData={lookupData}
        lookupStatus={lookupStatus}
        onRowChange={workspace.updateRow}
        onDepthCommit={workspace.commitDepthEdit}
        onAddRow={workspace.tryAddRow}
        onRemoveLastRow={removal.requestRemoveLastRow}
        isEnabled={isPageEnabled}
        isBlocked={
          Boolean(importer.pendingImport) || removal.isConfirmOpen || isSaving
        }
      />

      <div className="raw-litho-save-section">
        <button
          className="raw-litho-save-button"
          type="button"
          onClick={handleSave}
          disabled={!isPageEnabled || isSaving}
        >
          {isSaving ? "Saving…" : "Save"}
        </button>
      </div>
    </section>
  );
}

export default RawLitho;
