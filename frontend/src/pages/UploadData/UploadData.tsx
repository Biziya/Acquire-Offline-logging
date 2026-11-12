import type { DatasetInfo } from "../../types/domain";
import { errorMessage, isAbortError, isRecord } from "../../types/validation";
import {
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import UploadFileSection from "./UploadFileSection";
import DatasetSummary from "./DatasetSummary";
import ValidationSummary from "./ValidationSummary";
import UploadDataTable from "./UploadDataTable";
import { importUploadData } from "../../services/Api/uploadData";
import { getVerifiedWindowsIdentity } from "../../services/currentUser";
import { getRawLithoLookup } from "../../services/Api/rawLithoApi";
import { RAW_LITHO_LOOKUPS } from "../../services/rawLithoLookupConfig";
import {
  applyCellEdits,
  cellText,
  getDocumentRows,
  serializeDocument,
  type CellEdit,
  type UploadDocument,
} from "./uploadDataDocument";
import {
  validateUploadDocument,
  type RowStatus,
  type UploadLookups,
  type UploadValidation,
} from "./uploadDataValidation";
import { uploadDataConfig } from "./config";
import { tableColumns } from "../RawLitho/constants";
import { useUploadDataDraft, type DraftSource } from "./useUploadDataDraft";
import { useCurrentUser } from "../../hooks/useCurrentUser";
import { useToast } from "../../hooks/useToast";
import Toast from "../../components/Toast";
import PageTitle from "../../components/PageTitle";
import ConfirmDialog from "../../components/ConfirmDialog";
import {
  HELPER_TEXT,
  PRIMARY_BUTTON,
  SECONDARY_BUTTON,
  SECTION_TITLE,
} from "../../components/uiStyles";
import { FIELD, FIELD_CONTROL, FIELD_LABEL } from "../../components/fieldStyles";
import {
  SECTION,
  SECTION_HEADING,
  SECTION_HEADING_TEXT,
  STEP_NUMBER,
} from "./uploadDataStyles";
import { formatCount } from "../../utils/format";

function recordsWithErrors(count: number) {
  return count === 1 ? "1 record has errors" : `${formatCount(count)} records have errors`;
}

type StatusFilter = "all" | RowStatus;

interface FileInfo {
  name: string;
  size: number;
}

const CONTROL = `${FIELD_CONTROL} px-2.5`;


function displayValue(value: unknown, empty = "—") {
  return typeof value === "string" && value.trim() ? value.trim() : empty;
}

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function createInitialLookups(): UploadLookups {
  return {
    records: {},
    state: Object.fromEntries(
      RAW_LITHO_LOOKUPS.map((lookup) => [lookup.fieldKey, "loading"]),
    ),
  };
}

/*
 * Record indices to show, in file order. Rows edited since the filter last
 * changed (`pinned`) stay listed, so fixing an invalid record while showing
 * "Invalid" does not make it vanish under the caret.
 */
function filterRows(
  rows: readonly unknown[],
  validation: UploadValidation | null,
  search: string,
  status: StatusFilter,
  pinned: ReadonlySet<number>,
) {
  const visible: number[] = [];

  rows.forEach((row, index) => {
    if (
      pinned.has(index) ||
      ((status === "all" || validation?.rowStatus[index] === status) &&
        (!search ||
          tableColumns.some((column) =>
            cellText(row, column.key).toLocaleLowerCase().includes(search),
          )))
    ) {
      visible.push(index);
    }
  });

  return visible;
}

function describeValidation(validation: UploadValidation | null) {
  if (!validation) return "—";
  if (validation.hasBlockingErrors) {
    return validation.counts.error > 0
      ? recordsWithErrors(validation.counts.error)
      : "Has errors (see Validation summary)";
  }
  const hasWarnings =
    validation.counts.warning > 0 || validation.documentIssues.length > 0;
  return hasWarnings ? "Valid with warnings" : "Valid";
}

function UploadData() {
  // Name and size of the loaded file; kept in the draft, so they survive a refresh.
  const [selectedFile, setSelectedFile] = useState<FileInfo | null>(null);
  /*
   * The File itself, only while it was picked in this visit. A restored draft
   * has none, so its upload is built from the working document instead.
   */
  const originalFileRef = useRef<File | null>(null);
  // The one working copy of the parsed file; edits replace it.
  const [workingDocument, setWorkingDocument] = useState<UploadDocument | null>(
    null,
  );
  const [isEdited, setIsEdited] = useState(false);
  const [datasetVersion, setDatasetVersion] = useState(0);
  // Status messages use the shared toast (durations from config/ui.yaml).
  const { toast, showToast, hideToast } = useToast();
  const [isImporting, setIsImporting] = useState(false);
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [isDiscardOpen, setIsDiscardOpen] = useState(false);
  const [lookups, setLookups] = useState(createInitialLookups);
  // Imported By: null until a trusted Windows identity source exists.
  const currentUser = useCurrentUser();
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [pinnedRows, setPinnedRows] = useState<ReadonlySet<number>>(
    () => new Set(),
  );
  const requestControllerRef = useRef<AbortController | null>(null);
  const fileSelectionIdRef = useRef(0);

  /*
   * The working document is kept in IndexedDB (its own database, separate from
   * Raw Litho) so it survives navigation and refresh. A saved draft is only
   * restored when no file was picked while it was being read.
   */
  const draftSource = useMemo<DraftSource | null>(
    () =>
      selectedFile && workingDocument
        ? {
            fileName: selectedFile.name,
            fileSize: selectedFile.size,
            isEdited,
            document: workingDocument,
          }
        : null,
    [isEdited, selectedFile, workingDocument],
  );
  const draft = useUploadDataDraft(draftSource, (saved) => {
    if (fileSelectionIdRef.current !== 0) return false;

    originalFileRef.current = null;
    setSelectedFile({ name: saved.fileName, size: saved.fileSize });
    setWorkingDocument(saved.document);
    setIsEdited(saved.isEdited);
    setDatasetVersion((version) => version + 1);
    return true;
  });

  /*
   * Lookup codes for validation and the cell suggestion lists. Fetched straight
   * from the API, never cached by this page. A lookup that fails stays
   * "unavailable" and its codes are reported as not checked — never guessed.
   */
  useEffect(() => {
    let isActive = true;

    RAW_LITHO_LOOKUPS.forEach((lookup) => {
      getRawLithoLookup(lookup.fieldKey).then(
        (records) => {
          if (!isActive) return;
          setLookups((current) => ({
            records: { ...current.records, [lookup.fieldKey]: records },
            state: { ...current.state, [lookup.fieldKey]: "ready" },
          }));
        },
        () => {
          if (!isActive) return;
          setLookups((current) => ({
            ...current,
            state: { ...current.state, [lookup.fieldKey]: "unavailable" },
          }));
        },
      );
    });

    return () => {
      isActive = false;
    };
  }, []);

  // Filtering waits for typing to pause; a new search starts with no pins.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSearch(searchInput.trim().toLocaleLowerCase());
      setPinnedRows(new Set());
    }, uploadDataConfig.searchDebounceMs);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  /*
   * Validation and filtering follow a deferred copy of the document, so typing
   * in a cell stays responsive with 100,000 records; the upload itself always
   * re-validates the latest document.
   */
  const deferredDocument = useDeferredValue(workingDocument);
  const validation = useMemo(
    () =>
      deferredDocument
        ? validateUploadDocument(deferredDocument, lookups)
        : null,
    [deferredDocument, lookups],
  );
  const visibleRows = useMemo(
    () =>
      deferredDocument
        ? filterRows(
            getDocumentRows(deferredDocument),
            validation,
            search,
            statusFilter,
            pinnedRows,
          )
        : [],
    [deferredDocument, pinnedRows, search, statusFilter, validation],
  );


  const rows = workingDocument ? getDocumentRows(workingDocument) : [];
  const summary: DatasetInfo = {
    fileName: selectedFile?.name ?? "No file selected",
    project: displayValue(workingDocument?.project),
    campaign: displayValue(workingDocument?.campaign),
    drillhole: displayValue(workingDocument?.drillhole),
    // Three possibly different people: the creator and the last editor
    // recorded in the file, and whoever is signed in now (the intended
    // importer). None is ever guessed; a missing one shows "—".
    createdBy: displayValue(workingDocument?.created_by),
    editedBy: displayValue(workingDocument?.edited_by),
    importedBy: workingDocument ? (currentUser ?? "—") : "—",
    totalRecords: workingDocument ? formatCount(rows.length) : "—",
    fileSize: selectedFile
      ? `${formatFileSize(selectedFile.size)}${isEdited ? " (original file)" : ""}`
      : "—",
    validationStatus: describeValidation(validation),
  };

  function resetDataset() {
    setSelectedFile(null);
    originalFileRef.current = null;
    setWorkingDocument(null);
    setIsEdited(false);
    setIsConfirmOpen(false);
    setSearchInput("");
    setSearch("");
    setStatusFilter("all");
    setPinnedRows(new Set());
    setDatasetVersion((version) => version + 1);
  }

  // The one entry point for a new file: Browse Files and drag-and-drop.
  const handleFileSelect = async (file: File) => {
    const isJsonFile =
      file.type === "application/json" ||
      file.name.toLowerCase().endsWith(".json");

    // Refused before anything is reset, so the loaded dataset (and its edits)
    // survives a wrong file.
    if (!isJsonFile) {
      showToast({ type: "warning", message: "Choose a .json file" });
      return;
    }

    const selectionId = ++fileSelectionIdRef.current;
    requestControllerRef.current?.abort();
    requestControllerRef.current = null;
    setIsImporting(false);
    resetDataset();

    try {
      const dataset: unknown = JSON.parse(await file.text());

      if (selectionId !== fileSelectionIdRef.current) {
        return;
      }

      if (!isRecord(dataset)) {
        throw new Error("The JSON root must be an object");
      }

      originalFileRef.current = file;
      setSelectedFile({ name: file.name, size: file.size });
      setWorkingDocument(dataset);
    } catch (error) {
      if (selectionId !== fileSelectionIdRef.current) {
        return;
      }

      console.error("Unable to read the selected JSON dataset.", error);
      showToast({ type: "error", message: "This file isn't valid JSON. Check the file and try again." });
    }
  };

  const handleEdit = (edits: CellEdit[]) => {
    if (!workingDocument || isImporting) return;

    const edited = applyCellEdits(workingDocument, edits);
    if (edited === workingDocument) return;

    // A real edit records the trusted current user as the last editor; with
    // no identity the file's own edited_by is kept, never guessed.
    const next =
      currentUser && edited.edited_by !== currentUser
        ? { ...edited, edited_by: currentUser }
        : edited;
    setWorkingDocument(next);
    setIsEdited(true);

    if (search || statusFilter !== "all") {
      setPinnedRows((current) => {
        const pinned = new Set(current);
        edits.forEach((edit) => pinned.add(edit.rowIndex));
        return pinned;
      });
    }
  };

  // Upload to Database: validate the latest document, then ask for confirmation.
  const handleImportRequest = () => {
    if (!workingDocument || isImporting) return;

    const current = validateUploadDocument(workingDocument, lookups);
    if (current.hasBlockingErrors) {
      showToast({
        type: "warning",
        message:
          current.counts.error > 0
            ? `${recordsWithErrors(current.counts.error)}. Fix them before uploading.`
            : "Fix the errors before uploading",
      });
      return;
    }

    setIsConfirmOpen(true);
  };

  const handleImport = async () => {
    // The controller is set synchronously, so a second click cannot submit twice.
    if (
      !selectedFile ||
      !workingDocument ||
      isImporting ||
      requestControllerRef.current
    ) {
      return;
    }

    // Unchanged in this visit: the original file. Edited or restored from the
    // draft: a file built from the working copy, under the original name.
    const originalFile = originalFileRef.current;
    const file =
      isEdited || !originalFile
        ? new File([serializeDocument(workingDocument)], selectedFile.name, {
            type: "application/json",
          })
        : originalFile;

    const controller = new AbortController();
    requestControllerRef.current = controller;
    setIsConfirmOpen(false);
    setIsImporting(true);

    try {
      // Verify the Windows user now, against the backend. The sidebar's
      // cached (IndexedDB) identity is display-only and never authorizes an
      // upload; without a verified user nothing is sent, so usr can never be
      // written for the wrong person.
      const uploader = await getVerifiedWindowsIdentity(true);
      if (requestControllerRef.current !== controller || controller.signal.aborted) return;
      if (!uploader) {
        showToast({
          type: "error",
          message:
            "Couldn't confirm your Windows sign-in, so nothing was uploaded. Check that the server is online.",
        });
        return;
      }

      const response = await importUploadData(file, uploader.fullUsername, controller.signal);
      if (requestControllerRef.current === controller) {
        // Confirmed by the backend. The data stays on screen (and in the
        // draft) for checking or a corrected re-upload; Cancel clears it.
        showToast({
          type: "success",
          message: response.message || "Upload complete",
        });
      }
    } catch (error) {
      if (requestControllerRef.current === controller && !isAbortError(error)) {
        // The draft and its edits stay, so Upload to Database can be retried.
        showToast({ type: "error", message: errorMessage(error) || "Upload failed. Try again." });
      }
    } finally {
      if (requestControllerRef.current === controller) {
        requestControllerRef.current = null;
        setIsImporting(false);
      }
    }
  };

  const handleCancel = () => {
    fileSelectionIdRef.current += 1;
    requestControllerRef.current?.abort();
    requestControllerRef.current = null;
    resetDataset();
    setIsImporting(false);
    setIsDiscardOpen(false);
  };

  // Cancel and the remove-file button both discard the file and every edit,
  // so they ask first. With nothing loaded there is nothing to lose.
  const requestCancel = () => {
    if (!selectedFile && !workingDocument) {
      handleCancel();
      return;
    }
    setIsDiscardOpen(true);
  };

  return (
    <section className="flex min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden text-rl-text">
      {/*
        The title stays outside the scroll area, like Raw Litho and Database
        Viewer, so the page scrollbar starts below the header row and never
        runs under the shared keyboard shortcuts button.
      */}
      <PageTitle>{uploadDataConfig.title}</PageTitle>

      <div className="min-h-0 flex-1 overflow-y-auto pt-1.5 pb-2">
        {/*
          One column, or on extra-wide screens File Selection beside Dataset
          Information with the preview and summary full width below.
          minmax(0, …) lets a wide table scroll inside its frame instead of
          widening the page.
        */}
        <div className="grid grid-cols-[minmax(0,1fr)] gap-3 xl:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] xl:[&>*:nth-child(n+3)]:col-span-2">
          <UploadFileSection
            onFileSelect={handleFileSelect}
            onFileReject={(message) => showToast({ type: "warning", message })}
            selectedFileName={selectedFile?.name || ""}
            recordCount={rows.length}
            onFileRemove={requestCancel}
            isRemoveDisabled={isImporting}
          />
          <DatasetSummary summary={summary} />

          <section className={SECTION} aria-labelledby="json-preview-title">
            <div className={SECTION_HEADING}>
              <span className={STEP_NUMBER}>3</span>
              <div className={SECTION_HEADING_TEXT}>
                <h2 id="json-preview-title" className={SECTION_TITLE}>
                  Records
                </h2>
                <p className={HELPER_TEXT}>
                  Fix any errors in the table before you upload. Your edits are
                  saved on this PC until you upload or cancel.
                </p>
                {draft.saveFailed && (
                  <p className="m-0 text-[0.8125rem] text-rl-danger" role="status">
                    Draft not saved
                  </p>
                )}
              </div>
            </div>

            {workingDocument ? (
              <>
                <div className="mb-2 flex flex-wrap items-end gap-2.5">
                  <label className={FIELD}>
                    <span className={FIELD_LABEL}>Search</span>
                    <input
                      className={`${CONTROL} w-[220px] max-w-full`}
                      type="search"
                      value={searchInput}
                      placeholder="Search records"
                      onChange={(event) => setSearchInput(event.target.value)}
                    />
                  </label>
                  <label className={FIELD}>
                    <span className={FIELD_LABEL}>Show</span>
                    <select
                      className={CONTROL}
                      value={statusFilter}
                      onChange={(event) => {
                        setStatusFilter(event.target.value as StatusFilter);
                        setPinnedRows(new Set());
                      }}
                    >
                      <option value="all">All records</option>
                      <option value="error">Invalid records</option>
                      <option value="warning">Records with warnings</option>
                      <option value="valid">Valid records</option>
                    </select>
                  </label>
                  <p
                    className={`${HELPER_TEXT} ml-auto`}
                    aria-live="polite"
                  >
                    Showing {formatCount(visibleRows.length)} of{" "}
                    {formatCount(rows.length)} records
                    {isEdited && (
                      <span className="ml-2 rounded-ui bg-rl-navy-soft px-1.5 py-0.5 text-[0.75rem] font-semibold text-rl-navy">
                        Edited
                      </span>
                    )}
                  </p>
                </div>

                <UploadDataTable
                  key={datasetVersion}
                  rows={rows}
                  visibleRows={visibleRows}
                  validation={validation}
                  lookups={lookups}
                  isReadOnly={isImporting}
                  onEdit={handleEdit}
                />
              </>
            ) : (
              <p className={HELPER_TEXT}>
                {draft.isRestoring
                  ? "Restoring saved data…"
                  : "Choose a JSON file to see its records."}
              </p>
            )}
          </section>

          <ValidationSummary validation={validation} />
        </div>

        {toast && (
          <Toast
            key={toast.id}
            message={toast.message}
            type={toast.type}
            onClose={() => hideToast(toast.id)}
          />
        )}

        {/*
          Nothing is sent until Confirm Upload. Cancel is focused first, so a
          stray Enter cannot upload; Escape cancels. handleImport closes the
          dialog and sets its request guard synchronously, so repeated clicks
          send one request.
        */}
        {isConfirmOpen && workingDocument && (
          <ConfirmDialog
            title="Upload to database?"
            message="These records will be added to the database."
            facts={[
              ["Records", formatCount(rows.length)],
              ["Project", displayValue(workingDocument.project)],
              ["Drillhole", displayValue(workingDocument.drillhole)],
              ["Version", isEdited ? "Edited" : "Original file"],
            ]}
            confirmLabel="Upload"
            busyLabel="Uploading…"
            isBusy={isImporting}
            tone="primary"
            onConfirm={() => void handleImport()}
            onCancel={() => setIsConfirmOpen(false)}
          />
        )}

        {isDiscardOpen && (
          <ConfirmDialog
            title={isImporting ? "Stop the upload?" : "Discard this upload?"}
            message={
              isImporting
                ? "The upload is cancelled and the file is cleared."
                : "The file and your edits are removed from this PC. Nothing is sent to the database."
            }
            confirmLabel={isImporting ? "Stop upload" : "Discard"}
            cancelLabel={isImporting ? "Keep uploading" : "Keep editing"}
            tone="danger"
            onConfirm={handleCancel}
            onCancel={() => setIsDiscardOpen(false)}
          />
        )}

        <div className="mt-3 flex justify-between gap-2 max-[680px]:flex-col-reverse">
          <button
            className={`${SECONDARY_BUTTON} max-[680px]:w-full`}
            type="button"
            onClick={requestCancel}
          >
            Cancel
          </button>
          <button
            className={`${PRIMARY_BUTTON} max-[680px]:w-full`}
            type="button"
            onClick={handleImportRequest}
            disabled={!workingDocument || isImporting || isConfirmOpen}
          >
            {isImporting ? "Uploading…" : "Upload to database"}
          </button>
        </div>
      </div>
    </section>
  );
}

export default UploadData;
