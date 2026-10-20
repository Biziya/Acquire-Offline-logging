import { useCallback, useRef, useState } from "react";
import type {
  AddRowResult,
  Drillhole,
  DraftSession,
  ImportResult,
  Notify,
  RawLithoDocument,
  RowField,
  RowId,
} from "../../../types/domain";
import { TOAST_NOTIFICATIONS, RAW_LITHO_ROWS_PER_PAGE } from "../constants";
import {
  addDocumentRow,
  commitDepth,
  createBlankDocument,
  editRow,
  removeDocumentLastRow,
  sortDocument,
} from "../rawLithoDocumentOperations";
import { getPageForRowIndex } from "../rawLithoSorting";
import { useRawLithoDraftPersistence } from "./useRawLithoDraftPersistence";

const totalPagesFor = (lithoDocument: RawLithoDocument) =>
  Math.max(1, Math.ceil(lithoDocument.rows.length / RAW_LITHO_ROWS_PER_PAGE));

export function useRawLithoWorkspace({
  drillholes,
  showToast,
}: {
  drillholes: Drillhole[];
  showToast: Notify;
}) {
  const [selectedHoleId, setSelectedHoleId] = useState("");
  const [rawLithoDocument, setDocument] = useState(createBlankDocument);
  const [currentPage, setCurrentPage] = useState(1);
  // One working document; the ref provides its synchronous value between React commits.
  const documentRef = useRef(rawLithoDocument);
  const applyDocument = useCallback((lithoDocument: RawLithoDocument, page = 1) => {
    documentRef.current = lithoDocument;
    setDocument(lithoDocument);
    setCurrentPage(Math.min(Math.max(1, page), totalPagesFor(lithoDocument)));
  }, []);
  const persistence = useRawLithoDraftPersistence({
    selectedHoleId,
    currentPage,
    notify: showToast,
    onLoaded: applyDocument,
    onSessionRestored: (session: DraftSession) =>
      setSelectedHoleId(session.drillhole),
    buildFallback: (key) => {
      const record = drillholes.find((hole) => hole.holeId === key);
      return {
        drillhole: key,
        project: record?.projectCode ?? "",
        campaign: record?.campaign ?? "",
      };
    },
  });
  const {
    draftKey,
    isPageEnabled,
    isRestoringSession,
    stageDocument,
    canEdit,
    prepareSelection,
    flushPendingSaves,
  } = persistence;
  const commitDocument = (lithoDocument: RawLithoDocument) => {
    if (!draftKey || !canEdit(draftKey) || lithoDocument === documentRef.current)
      return;
    documentRef.current = lithoDocument;
    setDocument(lithoDocument);
    stageDocument(draftKey, lithoDocument);
  };

  const selectDrillhole = useCallback(
    (holeId: string) => {
      prepareSelection();
      setSelectedHoleId(holeId);
    },
    [prepareSelection],
  );
  const updateRow = (id: RowId, field: RowField, value: string) =>
    commitDocument(editRow(documentRef.current, id, field, value));
  const sortRows = () => commitDocument(sortDocument(documentRef.current));
  const commitDepthEdit = (id: RowId, field: RowField, previous: string) => {
    if (!canEdit(draftKey)) return;
    const result = commitDepth(documentRef.current, id, field, previous);
    commitDocument(result.document);
    if (result.reverted) showToast(TOAST_NOTIFICATIONS.invalidDepthRange);
  };

  const tryAddRow = (): AddRowResult => {
    if (!canEdit(draftKey)) return { created: false };
    const operation = addDocumentRow(documentRef.current);
    if (operation.issue) showToast(TOAST_NOTIFICATIONS[operation.issue.issue]);
    if (operation.result.created) {
      commitDocument(operation.document);
      const id = operation.result.rowId;
      setCurrentPage(
        getPageForRowIndex(
          operation.document.rows.findIndex((row) => row.id === id),
          RAW_LITHO_ROWS_PER_PAGE,
        ),
      );
      showToast(TOAST_NOTIFICATIONS.rowAdded);
    }
    return operation.result;
  };

  const removeLastRow = async () => {
    if (!canEdit(draftKey)) return false;
    const next = removeDocumentLastRow(documentRef.current);
    if (next === documentRef.current) return false;
    commitDocument(next);
    setCurrentPage((page) => Math.min(page, totalPagesFor(next)));
    return flushPendingSaves();
  };

  const applyImportedDocument = useCallback(
    (result: ImportResult) => {
      selectDrillhole(result.document.drillhole);
    },
    [selectDrillhole],
  );
  const totalPages = totalPagesFor(rawLithoDocument);
  const changeTablePage = useCallback(
    (page: number) => setCurrentPage(Math.min(Math.max(page, 1), totalPages)),
    [totalPages],
  );
  return {
    selectedHoleId,
    rawLithoDocument,
    rows: rawLithoDocument.rows,
    currentPage,
    totalPages,
    draftKey,
    isPageEnabled,
    isRestoringSession,
    selectDrillhole,
    updateRow,
    commitDepthEdit,
    sortRows,
    tryAddRow,
    removeLastRow,
    changeTablePage,
    applyImportedDocument,
    setRawLithoDocument: commitDocument,
    flushPendingSaves,
    retryDraftLoad: persistence.retryLoad,
    loadError: persistence.loadError,
    saveError: persistence.saveError,
  };
}
