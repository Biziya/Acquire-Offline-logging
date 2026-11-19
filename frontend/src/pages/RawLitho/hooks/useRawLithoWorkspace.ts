import { useCallback, useEffect, useRef, useState } from "react";
import type {
  AddRowResult,
  Drillhole,
  DraftSession,
  Notify,
  RawLithoDocument,
  RowField,
  RowId,
} from "../../../types/domain";
import { TOAST_NOTIFICATIONS } from "../constants";
import {
  addDocumentRow,
  applyCellEdits,
  commitDepth,
  createBlankDocument,
  editRow,
  clearDocumentCells,
  removeDocumentRows,
} from "../rawLithoDocumentOperations";
import type { CellEdit, CellRef } from "../rawLithoClipboard";
import { useRawLithoDraftPersistence } from "./useRawLithoDraftPersistence";

export function useRawLithoWorkspace({
  drillholes,
  showToast,
  currentUser = null,
}: {
  drillholes: Drillhole[];
  showToast: Notify;
  /*
   * Trusted Windows user, stamped as `created_by` on a new document and as
   * `edited_by` on every committed edit.
   */
  currentUser?: string | null;
}) {
  const [selectedHoleId, setSelectedHoleId] = useState("");
  const [rawLithoDocument, setDocument] = useState(createBlankDocument);
  // One working document; the ref provides its synchronous value between React commits.
  const documentRef = useRef(rawLithoDocument);
  // Drillhole of a document created in this session that still lacks a
  // creator, because the identity had not arrived when it was created.
  const awaitingCreator = useRef<string | null>(null);
  const applyDocument = useCallback(
    (lithoDocument: RawLithoDocument, isNew = false) => {
      documentRef.current = lithoDocument;
      awaitingCreator.current =
        isNew && !lithoDocument.created_by ? lithoDocument.drillhole : null;
      setDocument(lithoDocument);
    },
    [],
  );
  const persistence = useRawLithoDraftPersistence({
    selectedHoleId,
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
    stageDocument,
    canEdit,
    prepareSelection,
    flushPendingSaves,
  } = persistence;
  /*
   * Returning to the page restores the selected drillhole at once, before the
   * drillhole list has loaded, so a new document is built without Project /
   * Campaign. When the list arrives, fill those two from the selected hole's
   * entry — only where empty (a file's own values win), only for the document
   * still on screen (a newer selection is never overwritten). In memory only:
   * the next edit saves it like any other change.
   */
  useEffect(() => {
    const current = rawLithoDocument;
    if (!draftKey || current.drillhole !== draftKey) return;

    const record = drillholes.find((hole) => hole.holeId === draftKey);
    if (!record) return;

    const project = current.project || record.projectCode;
    const campaign = current.campaign || record.campaign;
    if (project === current.project && campaign === current.campaign) return;

    const next = { ...current, project, campaign };
    documentRef.current = next;
    setDocument(next);
  }, [draftKey, drillholes, rawLithoDocument]);

  const commitDocument = (lithoDocument: RawLithoDocument) => {
    if (!draftKey || !canEdit(draftKey) || lithoDocument === documentRef.current)
      return;
    // A new document created before the identity arrived gets its creator at
    // its first save, which is also when it is first written and exported.
    // Every committed change is an edit, so it also records the editor; with
    // no trusted identity the previous `edited_by` is left as it was.
    const next =
      currentUser &&
      !lithoDocument.created_by &&
      awaitingCreator.current === lithoDocument.drillhole
        ? { ...lithoDocument, created_by: currentUser, edited_by: currentUser }
        : currentUser
          ? { ...lithoDocument, edited_by: currentUser }
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
      showToast(TOAST_NOTIFICATIONS.rowAdded);
    }
    return operation.result;
  };

  /*
   * The document before the last delete / clear, and the one it produced.
   * Undo restores `before` only while `after` is still the current document:
   * any later edit (or another drillhole) makes the undo stale.
   */
  const lastUndo = useRef<{ before: RawLithoDocument; after: RawLithoDocument } | null>(null);

  const commitUndoable = (next: RawLithoDocument) => {
    const before = documentRef.current;
    commitDocument(next);
    lastUndo.current =
      documentRef.current === before ? null : { before, after: documentRef.current };
  };

  /* Deletes the selected rows (row numbers or F5), then waits for the draft write. */
  const removeRows = async (ids: readonly RowId[]) => {
    if (!canEdit(draftKey)) return false;
    const next = removeDocumentRows(documentRef.current, ids);
    if (next === documentRef.current) return false;
    commitUndoable(next);
    return flushPendingSaves();
  };

  /* Shift / Ctrl selection + Delete: empties those cells (rows stay). */
  const clearCells = async (cells: readonly CellRef[]) => {
    if (!canEdit(draftKey)) return false;
    const next = clearDocumentCells(documentRef.current, cells);
    if (next === documentRef.current) return true;
    commitUndoable(next);
    return flushPendingSaves();
  };

  /* Puts back the rows or values of the last delete / clear. */
  const undoLast = async () => {
    const undo = lastUndo.current;
    lastUndo.current = null;
    if (!undo || documentRef.current !== undo.after || !canEdit(draftKey)) {
      showToast(TOAST_NOTIFICATIONS.undoUnavailable);
      return false;
    }
    commitDocument(undo.before);
    const saved = await flushPendingSaves();
    showToast(saved ? TOAST_NOTIFICATIONS.undoDone : TOAST_NOTIFICATIONS.draftSaveFailed);
    return saved;
  };

  /*
   * Every table row receives these two. Stable identities let the memoized
   * RawLithoRow skip the rows a keystroke did not change; each call still
   * runs the latest closure (current draft key, identity and document).
   */
  const rowHandlers = useRef({ updateRow, commitDepthEdit });
  rowHandlers.current = { updateRow, commitDepthEdit };
  const stableUpdateRow = useCallback<typeof updateRow>(
    (...args) => rowHandlers.current.updateRow(...args),
    [],
  );
  const stableCommitDepthEdit = useCallback<typeof commitDepthEdit>(
    (...args) => rowHandlers.current.commitDepthEdit(...args),
    [],
  );

  return {
    selectedHoleId,
    rawLithoDocument,
    rows: rawLithoDocument.rows,
    isPageEnabled,
    selectDrillhole,
    updateRow: stableUpdateRow,
    commitDepthEdit: stableCommitDepthEdit,
    pasteCells,
    tryAddRow,
    removeRows,
    undoLast,
    clearCells,
    setRawLithoDocument: commitDocument,
    flushPendingSaves,
    retryDraftLoad: persistence.retryLoad,
    loadError: persistence.loadError,
  };
}
