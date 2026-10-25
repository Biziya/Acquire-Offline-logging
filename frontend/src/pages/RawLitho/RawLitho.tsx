import { useCallback, useMemo, useState } from "react";
import type { ImportResult } from "../../types/domain";
import ConfirmDialog from "./ConfirmDialog";
import RawLithoFilters from "./RawLithoFilters";
import RawLithoTable from "./RawLithoTable";
import Toast from "../../components/Toast";
import { TOAST_NOTIFICATIONS } from "./constants";
import { useDrillholes } from "./hooks/useDrillholes";
import { useWorkingDrillholes } from "./hooks/useWorkingDrillholes";
import { orderDrillholes, pickRecentWorkingHoleIds } from "./drillholeOrdering";
import { useRawLithoImport } from "./hooks/useRawLithoImport";
import { useRawLithoLookups } from "./hooks/useRawLithoLookups";
import { useRawLithoWorkspace } from "./hooks/useRawLithoWorkspace";
import { useRemoveRowConfirmation } from "./hooks/useRemoveRowConfirmation";
import { useToast } from "../../hooks/useToast";
import { useCurrentUser } from "../../hooks/useCurrentUser";
import { buildImportConfirmationMessage } from "./rawLithoImportService";
import {
  exportRawLithoSnapshot,
  touchRawLithoDocument,
} from "./rawLithoHelpers";
import {
  findFirstConditionalRuleIssue,
  hasInvalidLookupValues,
} from "./rawLithoValidation";
import { rawLithoConfig } from "./config";
import { OUTLINE_BUTTON, OUTLINE_BUTTON_NAVY } from "./rawLithoStyles";

function RawLitho() {
  const { toast, showToast, hideToast } = useToast();
  const { drillholes, recentHoleIds, isLoading, error, rememberDrillholeSelection } =
    useDrillholes(showToast);
  const { lookupData, lookupStatus } = useRawLithoLookups();
  // Null until a trusted Windows identity source exists (services/currentUser.ts).
  const currentUser = useCurrentUser();
  const workspace = useRawLithoWorkspace({ drillholes, showToast, currentUser });
  const [isSaving, setIsSaving] = useState(false);

  const {
    selectedHoleId,
    rawLithoDocument,
    rows,
    currentPage,
    totalPages,
    isPageEnabled,
    selectDrillhole,
    applyImportedDocument,
  } = workspace;

  /*
   * Selecting a drillhole both loads its draft and records it in the selection
   * history (which orders Recent Working Drillholes once it has saved data).
   * Clearing the field (holeId "") is not a selection, so it is not remembered.
   */
  const handleDrillholeChange = useCallback(
    (holeId: string) => {
      selectDrillhole(holeId);

      if (holeId) rememberDrillholeSelection(holeId);
    },
    [rememberDrillholeSelection, selectDrillhole],
  );

  // An imported drillhole is opened like a selected one, so it counts as
  // recently worked on too.
  const handleImported = useCallback(
    (result: ImportResult) => {
      applyImportedDocument(result);
      rememberDrillholeSelection(result.document.drillhole);
    },
    [applyImportedDocument, rememberDrillholeSelection],
  );

  const importer = useRawLithoImport({
    lookupData,
    selectionKey: selectedHoleId,
    showToast,
    onImported: handleImported,
  });

  // Recent Working Drillholes first, then All Drillholes (drillholeOrdering.ts).
  const workingDrafts = useWorkingDrillholes(rawLithoDocument, isPageEnabled);
  const selectorList = useMemo(
    () =>
      orderDrillholes(
        drillholes,
        pickRecentWorkingHoleIds(recentHoleIds, workingDrafts),
      ),
    [drillholes, recentHoleIds, workingDrafts],
  );

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

    // Save exports the finished JSON, so every row must meet the conditional
    // rules. The draft itself keeps autosaving, with every edit intact.
    const ruleIssue = findFirstConditionalRuleIssue(rows);
    if (ruleIssue) {
      showToast({
        type: "warning",
        message: `Row ${ruleIssue.rowIndex + 1}: ${ruleIssue.message}`,
      });
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
    <section className="flex min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden">
      {toast && (
        <Toast
          key={toast.id}
          message={toast.message}
          type={toast.type}
          isVisible
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

      <h1 className="m-0 mb-1 text-[1.3rem] font-[650] tracking-[-0.01em] text-rl-navy">
        {rawLithoConfig.title}
      </h1>

      <RawLithoFilters
        drillholes={selectorList.drillholes}
        recentCount={selectorList.recentCount}
        selectedHoleId={selectedHoleId}
        selectedDrillhole={selectedDrillhole}
        isLoading={isLoading}
        error={error}
        onDrillholeChange={handleDrillholeChange}
        actions={
          <>
            <button
              className={`${OUTLINE_BUTTON} ${OUTLINE_BUTTON_NAVY} h-[30px] px-3 disabled:cursor-not-allowed disabled:opacity-55`}
              type="button"
              onClick={importer.openFilePicker}
              disabled={!canImport}
            >
              Import JSON
            </button>

            <input
              ref={importer.fileInputRef}
              className="hidden"
              type="file"
              accept=".json,application/json"
              onChange={importer.selectFile}
              disabled={!canImport}
            />
          </>
        }
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
        onPasteCells={workspace.pasteCells}
        showToast={showToast}
        onAddRow={workspace.tryAddRow}
        onRemoveLastRow={removal.requestRemoveLastRow}
        isEnabled={isPageEnabled}
        isBlocked={
          Boolean(importer.pendingImport) || removal.isConfirmOpen || isSaving
        }
        footerEnd={
          <button
            className="h-8 cursor-pointer rounded-md border border-transparent bg-rl-navy px-5 font-semibold text-white transition-[background-color,box-shadow] duration-140 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-rl-cell-ring enabled:hover:bg-rl-navy-dark enabled:hover:shadow-[0_2px_6px_rgb(16_35_61/22%)] enabled:active:translate-y-px enabled:active:bg-rl-navy-darker enabled:active:shadow-none disabled:cursor-not-allowed disabled:opacity-55"
            type="button"
            onClick={handleSave}
            disabled={!isPageEnabled || isSaving}
          >
            {isSaving ? "Saving…" : "Save JSON"}
          </button>
        }
      />
    </section>
  );
}

export default RawLitho;
