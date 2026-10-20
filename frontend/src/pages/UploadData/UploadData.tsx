import { isAbortError, errorMessage } from "../../types/validation";
import { useRef, useState } from "react";
import UploadFileSection from "./UploadFileSection";
import DatasetSummary from "./DatasetSummary";
import { importUploadData } from "../../services/Api/uploadData";
import "./UploadData.css";

const EMPTY_SUMMARY = {
  fileName: "No file selected",
  project: "—",
  campaign: "—",
  drillhole: "—",
};

function isJsonDocument(dataset: unknown): dataset is Record<string, unknown> {
  return (
    dataset !== null && typeof dataset === "object" && !Array.isArray(dataset)
  );
}

function displayValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : "—";
}

function UploadData() {
  const [summary, setSummary] = useState(EMPTY_SUMMARY);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [parsedJson, setParsedJson] = useState<Record<string, unknown> | null>(
    null,
  );
  const [fileError, setFileError] = useState("");
  const [importError, setImportError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [isImporting, setIsImporting] = useState(false);
  const requestControllerRef = useRef<AbortController | null>(null);
  const fileSelectionIdRef = useRef(0);

  const handleFileSelect = async (file: File) => {
    const selectionId = ++fileSelectionIdRef.current;
    requestControllerRef.current?.abort();
    requestControllerRef.current = null;
    setIsImporting(false);
    setFileError("");
    setImportError("");
    setSuccessMessage("");
    setSelectedFile(null);
    setParsedJson(null);
    setSummary(EMPTY_SUMMARY);

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
      setParsedJson(dataset);
      setSummary({
        fileName: file.name,
        project: displayValue(dataset.project),
        campaign: displayValue(dataset.campaign),
        drillhole: displayValue(dataset.drillhole),
      });
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

  const handleImport = async () => {
    if (!selectedFile || !parsedJson || isImporting) {
      return;
    }

    const controller = new AbortController();
    requestControllerRef.current = controller;
    setIsImporting(true);
    setImportError("");
    setSuccessMessage("");

    try {
      const response = await importUploadData(selectedFile, controller.signal);
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
    setSelectedFile(null);
    setParsedJson(null);
    setSummary(EMPTY_SUMMARY);
    setFileError("");
    setImportError("");
    setSuccessMessage("");
    setIsImporting(false);
  };

  return (
    <section className="upload-data-page">
      <header className="upload-data-header">
        <h1>Upload Data to Database</h1>
      </header>

      <div className="upload-data-workflow">
        <UploadFileSection
          onFileSelect={handleFileSelect}
          fileError={fileError}
          selectedFileName={selectedFile?.name || ""}
        />
        <DatasetSummary summary={summary} />
      </div>

      {successMessage && (
        <p
          className="upload-data-message upload-data-message-success"
          role="status"
        >
          {successMessage}
        </p>
      )}
      {importError && (
        <p
          className="upload-data-message upload-data-message-error"
          role="alert"
        >
          {importError}
        </p>
      )}

      <div className="upload-data-actions">
        <button
          className="upload-data-button upload-data-button-secondary"
          type="button"
          onClick={handleCancel}
        >
          Cancel
        </button>
        <button
          className="upload-data-button upload-data-button-primary"
          type="button"
          onClick={handleImport}
          disabled={!parsedJson || isImporting}
        >
          {isImporting ? "Importing…" : "Import Data"}
        </button>
      </div>
    </section>
  );
}

export default UploadData;
