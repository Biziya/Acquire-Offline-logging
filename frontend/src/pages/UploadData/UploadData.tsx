import type { DatasetInfo, RowField } from "../../types/domain";
import { isAbortError, errorMessage } from "../../types/validation";
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
import { getRawLithoLookup } from "../../services/Api/rawLithoApi";
import {
  RAW_LITHO_ALL_LOOKUPS,
  RAW_LITHO_LOOKUPS,
} from "../../services/rawLithoLookupConfig";
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
import {
  BUTTON_PRIMARY,
  BUTTON_SECONDARY,
  SECTION,
  SECTION_HEADING,
  SECTION_TEXT,
  SECTION_TITLE,
  STEP_NUMBER,
} from "./uploadDataStyles";

type StatusFilter = "all" | RowStatus;

const NOT_AVAILABLE = "Not available";
const numberFormat = new Intl.NumberFormat("en-US");
const CONTROL =
  "h-9 rounded-md border border-[#cbd5e1] bg-white px-2.5 text-[0.9rem] focus:border-[#2563eb] focus:shadow-[0_0_0_3px_rgb(37_99_235/18%)] focus:outline-none";

function isJsonDocument(dataset: unknown): dataset is Record<string, unknown> {
  return (
    dataset !== null && typeof dataset === "object" && !Array.isArray(dataset)
  );
}

function displayValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : "—";
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
          uploadDataConfig.columns.some((column) =>
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
      ? `Invalid — ${numberFormat.format(validation.counts.error)} records with errors`
      : "Invalid — see Validation Summary";
  }
  const hasWarnings =
    validation.counts.warning > 0 || validation.documentIssues.length > 0;
  return hasWarnings ? "Valid with warnings" : "Valid";
}

function UploadData() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  // The one working copy of the parsed file; edits replace it.
  const [workingDocument, setWorkingDocument] = useState<UploadDocument | null>(
    null,
  );
  const [isEdited, setIsEdited] = useState(false);
  const [datasetVersion, setDatasetVersion] = useState(0);
  const [fileError, setFileError] = useState("");
  const [importError, setImportError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [isImporting, setIsImporting] = useState(false);
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [lookups, setLookups] = useState(createInitialLookups);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [pinnedRows, setPinnedRows] = useState<ReadonlySet<number>>(
    () => new Set(),
  );
  const requestControllerRef = useRef<AbortController | null>(null);
  const fileSelectionIdRef = useRef(0);

  /*
   * Lookup codes for validation and the cell suggestion lists. Fetched straight
   * from the API: this page keeps nothing in IndexedDB or Local Storage. A
   * lookup that fails stays "unavailable" and its codes are reported as not
   * checked — never guessed.
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

  const lookupOptions = useMemo(() => {
    const options: Partial<Record<RowField, string[]>> = {};

    RAW_LITHO_ALL_LOOKUPS.forEach((lookup) => {
      const records = lookup.options ?? lookups.records[lookup.fieldKey] ?? [];
      options[lookup.fieldKey] = Array.from(
        new Set(
          records.flatMap((record) => {
            const code = record[lookup.codeProperty];
            return typeof code === "string" && code.trim() ? [code.trim()] : [];
          }),
        ),
      );
    });

    return options;
  }, [lookups.records]);

  const rows = workingDocument ? getDocumentRows(workingDocument) : [];
  const summary: DatasetInfo = {
    fileName: selectedFile?.name ?? "No file selected",
    project: displayValue(workingDocument?.project),
    campaign: displayValue(workingDocument?.campaign),
    drillhole: displayValue(workingDocument?.drillhole),
    // The Raw Litho JSON format records no creator, and the application has no
    // signed-in user, so neither value can be shown.
    createdBy: workingDocument ? NOT_AVAILABLE : "—",
    uploadedBy: workingDocument ? NOT_AVAILABLE : "—",
    totalRecords: workingDocument ? numberFormat.format(rows.length) : "—",
    fileSize: selectedFile
      ? `${formatFileSize(selectedFile.size)}${isEdited ? " (original file)" : ""}`
      : "—",
    validationStatus: describeValidation(validation),
  };

  function resetDataset() {
    setSelectedFile(null);
    setWorkingDocument(null);
    setIsEdited(false);
    setIsConfirmOpen(false);
    setSearchInput("");
    setSearch("");
    setStatusFilter("all");
    setPinnedRows(new Set());
    setDatasetVersion((version) => version + 1);
  }

  const handleFileSelect = async (file: File) => {
    const selectionId = ++fileSelectionIdRef.current;
    requestControllerRef.current?.abort();
    requestControllerRef.current = null;
    setIsImporting(false);
    setFileError("");
    setImportError("");
    setSuccessMessage("");
    resetDataset();

    try {
      const isJsonFile =
        file.type === "application/json" ||
        file.name.toLowerCase().endsWith(".json");

      if (!isJsonFile) {
        throw new Error("Unsupported file type");
      }

      const dataset: unknown = JSON.parse(await file.text());

      if (selectionId !== fileSelectionIdRef.current) {
        return;
      }

      if (!isJsonDocument(dataset)) {
        throw new Error("The JSON root must be an object");
      }

      setSelectedFile(file);
      setWorkingDocument(dataset);
    } catch (error) {
      if (selectionId !== fileSelectionIdRef.current) {
        return;
      }

      console.error("Unable to read the selected JSON dataset.", error);
      setFileError(
        "Unable to read this JSON dataset. Please choose a valid file.",
      );
    }
  };

  const handleEdit = (edits: CellEdit[]) => {
    if (!workingDocument || isImporting) return;

    const next = applyCellEdits(workingDocument, edits);
    if (next === workingDocument) return;

    setWorkingDocument(next);
    setIsEdited(true);
    setImportError("");
    setSuccessMessage("");

    if (search || statusFilter !== "all") {
      setPinnedRows((current) => {
        const pinned = new Set(current);
        edits.forEach((edit) => pinned.add(edit.rowIndex));
        return pinned;
      });
    }
  };

  // Import Data: validate the latest document, then ask for confirmation.
  const handleImportRequest = () => {
    if (!workingDocument || isImporting) return;

    const current = validateUploadDocument(workingDocument, lookups);
    if (current.hasBlockingErrors) {
      setSuccessMessage("");
      setImportError(
        `Fix the blocking errors before importing (${numberFormat.format(
          current.counts.error,
        )} invalid records). See the Validation Summary.`,
      );
      return;
    }

    setImportError("");
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

    // Unchanged: the original file. Edited: a file built from the working copy.
    const file = isEdited
      ? new File([serializeDocument(workingDocument)], selectedFile.name, {
          type: "application/json",
        })
      : selectedFile;

    const controller = new AbortController();
    requestControllerRef.current = controller;
    setIsConfirmOpen(false);
    setIsImporting(true);
    setImportError("");
    setSuccessMessage("");

    try {
      const response = await importUploadData(file, controller.signal);
      if (requestControllerRef.current === controller)
        setSuccessMessage(response.message || "Data imported successfully.");
    } catch (error) {
      if (requestControllerRef.current === controller && !isAbortError(error)) {
        setImportError(
          errorMessage(error) || "Unable to import the selected data.",
        );
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
    setFileError("");
    setImportError("");
    setSuccessMessage("");
    setIsImporting(false);
  };

  return (
    <section className="mx-auto min-h-0 w-[min(100%,1200px)] flex-1 overflow-y-auto p-8 text-[#172033] max-[680px]:px-3.5 max-[680px]:py-5">
      <header className="mb-6">
        <h1 className="mt-1 mb-2 text-[clamp(1.8rem,4vw,2.35rem)] font-bold">
          {uploadDataConfig.title}
        </h1>
      </header>

      <div className="grid gap-4">
        <UploadFileSection
          onFileSelect={handleFileSelect}
          fileError={fileError}
          selectedFileName={selectedFile?.name || ""}
        />
        <DatasetSummary summary={summary} />

        <section className={SECTION} aria-labelledby="json-preview-title">
          <div className={SECTION_HEADING}>
            <span className={STEP_NUMBER}>3</span>
            <div>
              <h2 id="json-preview-title" className={SECTION_TITLE}>
                Editable JSON Preview
              </h2>
              <p className={SECTION_TEXT}>
                Review and correct records before import. Changes stay on this
                page only; Cancel or a refresh discards them.
              </p>
            </div>
          </div>

          {workingDocument ? (
            <>
              <div className="mb-2.5 flex flex-wrap items-end gap-3">
                <label className="grid gap-1 text-[0.8rem] font-semibold text-[#667389]">
                  Search
                  <input
                    className={`${CONTROL} min-w-[220px]`}
                    type="search"
                    value={searchInput}
                    placeholder="Search records"
                    onChange={(event) => setSearchInput(event.target.value)}
                  />
                </label>
                <label className="grid gap-1 text-[0.8rem] font-semibold text-[#667389]">
                  Show
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
                  className="m-0 ml-auto text-[0.86rem] font-semibold text-[#334155]"
                  aria-live="polite"
                >
                  Showing {numberFormat.format(visibleRows.length)} of{" "}
                  {numberFormat.format(rows.length)} records
                  {isEdited && (
                    <span className="ml-2 rounded-full bg-[#eaf1ff] px-2 py-0.5 text-[0.75rem] text-[#245fc5]">
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
                lookupOptions={lookupOptions}
                isReadOnly={isImporting}
                onEdit={handleEdit}
              />
            </>
          ) : (
            <p className="m-0 text-[0.9rem] text-[#738095]">
              Select a JSON file to preview its records.
            </p>
          )}
        </section>

        <ValidationSummary validation={validation} />
      </div>

      {successMessage && (
        <p
          className="mt-4 mb-0 rounded-lg border border-[#86efac] bg-[#f0fdf4] px-3.5 py-[11px] text-[0.9rem] text-[#166534]"
          role="status"
        >
          {successMessage}
        </p>
      )}
      {importError && (
        <p
          className="mt-4 mb-0 rounded-lg border border-[#fca5a5] bg-[#fef2f2] px-3.5 py-[11px] text-[0.9rem] text-[#b42318]"
          role="alert"
        >
          {importError}
        </p>
      )}

      {isConfirmOpen && workingDocument && (
        <div
          className="mt-6 rounded-xl border border-[#bfdbfe] bg-[#eff6ff] p-4"
          role="alertdialog"
          aria-labelledby="upload-confirm-title"
          aria-describedby="upload-confirm-message"
          onKeyDown={(event) => {
            if (event.key === "Escape") setIsConfirmOpen(false);
          }}
        >
          <h2 id="upload-confirm-title" className="m-0 mb-1 text-[1.05rem] font-bold">
            Import {numberFormat.format(rows.length)} records?
          </h2>
          <p id="upload-confirm-message" className="m-0 text-[0.9rem] text-[#334155]">
            Project {displayValue(workingDocument.project)}, drillhole{" "}
            {displayValue(workingDocument.drillhole)}.{" "}
            {isEdited
              ? "Your edited version will be uploaded."
              : "The original file will be uploaded unchanged."}
          </p>
          <div className="mt-3 flex justify-end gap-3">
            <button
              className={BUTTON_SECONDARY}
              type="button"
              onClick={() => setIsConfirmOpen(false)}
            >
              Back
            </button>
            <button
              className={BUTTON_PRIMARY}
              type="button"
              onClick={handleImport}
              autoFocus
            >
              Confirm import
            </button>
          </div>
        </div>
      )}

      <div className="mt-6 flex justify-between gap-3 max-[680px]:flex-col-reverse">
        <button
          className={`${BUTTON_SECONDARY} max-[680px]:w-full`}
          type="button"
          onClick={handleCancel}
        >
          Cancel
        </button>
        <button
          className={`${BUTTON_PRIMARY} max-[680px]:w-full`}
          type="button"
          onClick={handleImportRequest}
          disabled={!workingDocument || isImporting || isConfirmOpen}
        >
          {isImporting ? "Importing…" : "Import Data"}
        </button>
      </div>
    </section>
  );
}

export default UploadData;
