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
  applyCellEdits,
  commitDepth,
  createBlankDocument,
  editRow,
  removeDocumentLastRow,
  sortDocument,
} from "../rawLithoDocumentOperations";
import { getPageForRowIndex } from "../rawLithoSorting";
import type { CellEdit } from "../rawLithoClipboard";
import { useRawLithoDraftPersistence } from "./useRawLithoDraftPersistence";

const totalPagesFor = (lithoDocument: RawLithoDocument) =>
  Math.max(1, Math.ceil(lithoDocument.rows.length / RAW_LITHO_ROWS_PER_PAGE));

export function useRawLithoWorkspace({
  drillholes,
  showToast,
  currentUser = null,
}: {
  drillholes: Drillhole[];
  showToast: Notify;
  /* Trusted Windows user, stamped as `created_by` on a new document. */
  currentUser?: string | null;
}) {
  const [selectedHoleId, setSelectedHoleId] = useState("");
  const [rawLithoDocument, setDocument] = useState(createBlankDocument);
  const [currentPage, setCurrentPage] = useState(1);
  // One working document; the ref provides its synchronous value between React commits.
  const documentRef = useRef(rawLithoDocument);
  // Drillhole of a document created in this session that still lacks a
  // creator, because the identity had not arrived when it was created.
  const awaitingCreator = useRef<string | null>(null);
  const applyDocument = useCallback(
    (lithoDocument: RawLithoDocument, page = 1, isNew = false) => {
      documentRef.current = lithoDocument;
      awaitingCreator.current =
        isNew && !lithoDocument.created_by ? lithoDocument.drillhole : null;
      setDocument(lithoDocument);
      setCurrentPage(Math.min(Math.max(1, page), totalPagesFor(lithoDocument)));
    },
    [],
  );
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
        // Used only when this creates a NEW document; normalisation ignores
        // it for a stored draft, so an existing creator is never replaced.
        created_by: currentUser ?? undefined,
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
    // A new document created before the identity arrived gets its creator at
    // its first save, which is also when it is first written and exported.
    const next =
      currentUser &&
      !lithoDocument.created_by &&
      awaitingCreator.current === lithoDocument.drillhole
        ? { ...lithoDocument, created_by: currentUser }
        : lithoDocument;
    if (next.created_by) awaitingCreator.current = null;
    documentRef.current = next;
    setDocument(next);
    stageDocument(draftKey, next);
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

  /* One atomic, validated, sorted edit; autosaved like any other change. */
  const pasteCells = (edits: CellEdit[]) => {
    if (!canEdit(draftKey)) return;
    const result = applyCellEdits(documentRef.current, edits);
    if (result.issue) {
      showToast(TOAST_NOTIFICATIONS[result.issue]);
      return;
    }
    commitDocument(result.document);
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
    pasteCells,
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
